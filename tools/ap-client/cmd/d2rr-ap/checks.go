package main

import (
	"context"
	"fmt"

	"github.com/swannysoft/d2rr-ap-client/internal/game"
	"github.com/swannysoft/d2rr-ap-client/internal/ids"
	"github.com/swannysoft/d2rr-ap-client/internal/save"
)

// pollSave reads the character file and reports any newly checked locations.
func (a *app) pollSave(ctx context.Context) {
	a.mu.Lock()
	saveDir := a.saveDir
	goal, wantWaypoints := a.goalDifficulty, a.includeWaypoints
	a.mu.Unlock()
	path, err := a.characterSave(saveDir)
	if err != nil {
		a.warnAttach(err.Error())
		return
	}
	st, err := save.ParseFile(path)
	if err != nil {
		return // a save may be mid-flush
	}
	if st.Name != a.session.CharacterName() {
		a.warnAttach("save header does not match the bound character")
		return
	}

	// Never send a check for a difficulty the character cannot have entered.
	//
	// D2R flags the Act I town waypoint ACTIVE IN ALL THREE difficulty blocks the
	// moment a character is created, so a brand-new save reports Rogue Encampment
	// for Normal, Nightmare and Hell. Measured on a fresh character: 3 waypoint
	// checks before leaving town. Sending those hands the player two free checks
	// they never earned, and on a Normal-goal room they name locations the room
	// does not even contain.
	//
	// Beating Baal is what unlocks the next difficulty, so this is exactly the
	// bound. It can never suppress a legitimate check: you cannot complete a quest
	// or reach a waypoint in a difficulty you cannot enter.
	var newIDs []int64
	maxDifficulty := save.HighestUnlockedDifficulty(st)
	if maxDifficulty > goal {
		maxDifficulty = goal
	}

	for _, q := range st.CompletedQuests {
		if q.Difficulty > maxDifficulty {
			continue
		}
		if id, ok := ids.QuestLocationID(q.Difficulty, q.Act, q.Index); ok && a.conn.KnownLocation(id) {
			if key := q.ID(); !a.seen(key) {
				newIDs = append(newIDs, id)
				logf("check: %s %s (A%d)", save.DifficultyNames[q.Difficulty], q.Name, q.Act+1)
			}
		}
	}
	for _, w := range st.ActiveWaypoints {
		if !wantWaypoints || w.Difficulty > maxDifficulty {
			continue
		}
		if id, ok := ids.WaypointLocationID(w.Difficulty, w.Index); ok {
			if key := w.ID(); !a.seen(key) {
				newIDs = append(newIDs, id)
			}
		}
	}
	a.maybeReportGoal(ctx, st)

	// Kept for the area checks, which need the save to establish which
	// difficulties the character has actually unlocked.
	a.mu.Lock()
	a.lastState = st
	a.mu.Unlock()
	a.sendChecks(ctx, newIDs)
}

// sendChecks persists then transmits. Persist BEFORE sending: a crash between the two
// costs a duplicate send, which the server dedupes, whereas the reverse order loses the
// check permanently.
func (a *app) sendChecks(ctx context.Context, newIDs []int64) {
	// The room decides which locations exist: nothing past the goal boss, and nothing
	// from a group of checks the slot switched off.
	wanted := newIDs[:0]
	for _, id := range newIDs {
		if a.conn.KnownLocation(id) {
			wanted = append(wanted, id)
		}
	}
	newIDs = wanted
	if len(newIDs) == 0 {
		return
	}
	added, err := a.session.AddChecks(newIDs)
	if err != nil {
		logf("persisting checks failed: %v", err)
		a.mu.Lock()
		a.lastSeen = map[string]bool{}
		a.mu.Unlock()
		return
	}
	if len(added) == 0 {
		return
	}
	if a.conn.Connected() {
		if err := a.conn.SendChecks(ctx, added); err != nil {
			logf("send failed (%v); queued for reconnect", err)
		}
	} else {
		logf("offline: %d check(s) queued", len(added))
	}
}

// pollProgress emits the checks that only memory can see: the area the player is
// standing in, and the character level they have reached.
//
// Area checks are 393 of the 689 locations: without them a large pool has nowhere to go.
func (a *app) pollProgress(ctx context.Context) {
	if a.gc == nil || !a.attached {
		return
	}
	a.mu.Lock()
	wantWaypoints := a.includeWaypoints
	wantAreas, wantLevels, cap := a.includeAreas, a.includeLevels, a.levelCap
	st := a.lastState
	goal := a.goalDifficulty
	a.mu.Unlock()

	if goal < 0 {
		return
	}
	// Resolved once per tick: every check below files under the same difficulty.
	res := a.currentDifficulty(st)
	if !res.OK {
		a.warnDifficulty(res.Reason)
	}

	prog, ok := a.gc.Progress()
	if !ok {
		return // between game states; a half-loaded unit must not produce a check
	}

	var newIDs []int64

	if wantLevels {
		// Every level from 2 up to the current one, not just the current one: the
		// client may have been down while the character levelled, and unlike an area
		// a level cannot be revisited to re-trigger the check.
		for clvl := ids.LevelMin; clvl <= prog.CharLevel && clvl <= cap; clvl++ {
			id, ok := ids.LevelLocationID(clvl)
			if !ok {
				continue
			}
			if key := fmt.Sprintf("lvl:%d", clvl); !a.seen(key) {
				newIDs = append(newIDs, id)
				logf("check: reached level %d", clvl)
			}
		}
	}

	// Waypoints, read LIVE from the panel rather than waited for in the save.
	//
	// These duplicate what pollSave eventually finds, deliberately: the save version is
	// authoritative and complete but can be a whole session late, while this one is
	// immediate and covers only the current act. Both produce the same `wp:d:i` dedupe
	// key, so whichever arrives first wins and the other is a no-op.
	if wantWaypoints && res.OK {
		for _, areaID := range a.gc.AvailableWaypointAreaIDs() {
			index, known := ids.WaypointIndexForLevelID(areaID)
			if !known {
				continue
			}
			id, ok := ids.WaypointLocationID(res.Difficulty, index)
			if !ok {
				continue
			}
			if key := fmt.Sprintf("wp:%d:%d", res.Difficulty, index); !a.seen(key) {
				newIDs = append(newIDs, id)
				logf("check: waypoint %s (%s)", areaLabel(areaID),
					save.DifficultyNames[res.Difficulty])
			}
		}
	}

	// Quests, read live once the layout has been proven against the save.
	if res.OK {
		newIDs = append(newIDs, a.liveQuestChecks(st, res.Difficulty)...)
	}

	if wantAreas {
		if index, known := ids.AreaIndexForLevelID(prog.AreaLevelID); known {
			// Attributing an area to the wrong difficulty means the right location is
			// never sent, which strands whatever item fill put there — in a multiworld,
			// somebody else's progression.
			if res.NeedsOverrideWarning() {
				a.warnAssumedDifficulty(res)
			}
			if id, ok := ids.AreaLocationID(res.Difficulty, index); ok && res.OK {
				key := fmt.Sprintf("area:%d:%d", res.Difficulty, index)
				if !a.seen(key) {
					newIDs = append(newIDs, id)
					logf("check: entered %s (%s)", ids.AreaLabels[index],
						save.DifficultyNames[res.Difficulty])
				}
			}
		}
	}

	if a.gc.PlayerUnit() != a.player {
		a.mu.Lock()
		a.lastSeen = map[string]bool{}
		a.mu.Unlock()
		a.resetPlayer()
		return
	}
	a.sendChecks(ctx, newIDs)
}

// liveQuestChecks returns quest checks visible in memory but not yet in the save.
//
// The in-memory quest block's layout is NOT documented and the candidates disagree --
// d2go reads a byte per quest at act bases {0,8,16,24,34}, breaking its own stride on
// Act V, while the .d2s uses 16 bytes per act and a word per quest. Committing to the
// wrong one does not fail loudly: it yields a plausible, wrong set of completed quests
// and sends checks the player never earned, which in a multiworld releases other
// people's items early and cannot be undone.
//
// So the save is used as ground truth to prove a layout before any of this is trusted,
// and until it does, quests keep arriving the save way. Calibration needs at least one
// completed quest and an unambiguous match; see game.CalibrateQuestLayout.
func (a *app) liveQuestChecks(st *save.State, difficulty int) []int64 {
	if st == nil {
		return nil // calibration needs a parsed save before memory can prove anything
	}
	block := a.gc.QuestBytes()
	if len(block) < game.QuestBlockSize {
		return nil
	}

	fromSave := map[game.QuestID]bool{}
	for _, q := range st.CompletedQuests {
		if q.Difficulty == difficulty {
			fromSave[game.QuestID{Act: q.Act, Index: q.Index}] = true
		}
	}

	a.mu.Lock()
	layout, ok := a.questLayout, a.questLayoutOK
	a.mu.Unlock()

	if !ok {
		// Only ever calibrate against a save that is up to date. A block holding a
		// quest the save has not recorded yet is exactly the situation this feature
		// exists for, and also exactly when an exact match is impossible -- so a failed
		// calibration here is normal, not an error.
		layout, ok = game.CalibrateQuestLayout(block, fromSave)
		if !ok {
			a.warnNoQuestLayout(len(fromSave))
			return nil
		}
		a.mu.Lock()
		a.questLayout, a.questLayoutOK = layout, true
		a.mu.Unlock()
		logf("quest layout confirmed against the save: %s", layout.Name)
		logf("  quest checks now come from memory instead of waiting for a save write")
	}

	var out []int64
	for _, q := range game.CompletedQuests(block, layout) {
		if fromSave[q] {
			continue // the save already has it; pollSave will send it, or already did
		}
		id, valid := ids.QuestLocationID(difficulty, q.Act, q.Index)
		if !valid {
			continue
		}
		key := fmt.Sprintf("q:%d:%d:%d", difficulty, q.Act, q.Index)
		if a.seen(key) {
			continue
		}
		out = append(out, id)
		logf("check: %s (A%d) — from memory, ahead of the save",
			save.QuestNames[q.Act][q.Index], q.Act+1)
	}
	return out
}

// warnNoQuestLayout explains, once, why quest checks are still on the slow path.
func (a *app) warnNoQuestLayout(saveCount int) {
	a.mu.Lock()
	already := a.warnedNoLayout
	a.warnedNoLayout = true
	a.mu.Unlock()
	if already || saveCount == 0 {
		return // with no completed quests there is nothing to calibrate against yet
	}
	logf("could not confirm the in-memory quest layout against the save (%d quest(s) known)",
		saveCount)
	logf("  quest checks will keep coming from the save, which is correct but slower")
}

// maybeReportGoal sends the completion status once the quest that records the goal
// boss's death is done on the goal difficulty. Archipelago will not mark the slot
// finished on location checks alone — the client has to say so explicitly.
func (a *app) maybeReportGoal(ctx context.Context, st *save.State) {
	a.mu.Lock()
	goal, act := a.goalDifficulty, a.goalAct
	a.mu.Unlock()
	if goal < 0 || a.session.HasGoal() || !a.conn.Connected() {
		return
	}
	if goalReached(st, goal, act) {
		if err := a.conn.SendGoal(ctx); err != nil {
			logf("reporting goal failed: %v", err)
			return
		}
		logf("GOAL COMPLETE: %s defeated on %s", goalBossNames[act], difficultyName(goal))
	}
}

// goalReached reports whether the save records the goal boss's death.
func goalReached(st *save.State, difficulty, act int) bool {
	if act < 0 || act >= len(ids.GoalQuestIndex) {
		return false
	}
	for _, q := range st.CompletedQuests {
		if q.Difficulty == difficulty && q.Act == act && q.Index == ids.GoalQuestIndex[act] {
			return true
		}
	}
	return false
}

// areaLabel is the display name for a levels.txt area id, for the log only.
func areaLabel(levelID int) string {
	if i, ok := ids.AreaIndexForLevelID(levelID); ok {
		return ids.AreaLabels[i]
	}
	return fmt.Sprintf("area %d", levelID)
}
