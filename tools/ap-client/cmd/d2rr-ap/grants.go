//go:build windows

package main

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/Dune172/d2r-skill-randomizer/tools/ap-client/internal/game"
	"github.com/Dune172/d2r-skill-randomizer/tools/ap-client/internal/ids"
	"github.com/hectorgimenez/d2go/pkg/data/stat"
)

const (
	// How long a Skill Lock Trap withholds unspent skill points.
	skillLockDuration = time.Minute
	// How long to wait for the game to register a DeathLink kill before concluding it
	// does not honour the write.
	killGrace = 3 * time.Second
)

// gameView is the part of the running game the grant and skill-point code reads and
// writes. The real one is *game.Client; tests substitute a character made of a map.
type gameView interface {
	SpentSkillPoints(player uintptr, classSkillIDs map[int]bool) (int, error)
	SetUnspentSkillPoints(player uintptr, n int) (bool, error)
	BaseStat(unit uintptr, id stat.ID) (uint32, bool, error)
	SetPlayerStat(player uintptr, id stat.ID, value uint32) (bool, error)
	// GivePlayerStat sets a stat, creating its entry when the character has none and
	// every list it goes in keeps spare free slots after it.
	GivePlayerStat(player uintptr, id stat.ID, value uint32, spare int) error
	SpentStatPoints(player uintptr, classBase int) (int, error)
	Apply(player uintptr, effect game.TrapEffect) (bool, error)
	IsDead(player uintptr) (bool, error)
	Progress() (game.Progress, bool)
}

func (a *app) view() gameView {
	if a.fakeGame != nil {
		return a.fakeGame
	}
	return a.gc
}

// setOrGive writes a stat the character should hold, creating its entry if the game has
// not (a fresh character has no point pools, and the game drops a pool spent to zero).
// A value of zero for a missing entry is left alone: there is nothing to hold.
func (a *app) setOrGive(player uintptr, id stat.ID, value uint32, spare int) error {
	existed, err := a.view().SetPlayerStat(player, id, value)
	if err != nil || existed || value == 0 {
		return err
	}
	return a.view().GivePlayerStat(player, id, value, spare)
}

// waitingForRoom says, in a player's terms, why a grant could not be added yet.
func waitingForRoom(what string, err error) string {
	if errors.Is(err, game.ErrNoRoom) {
		return what + ": waiting for the game to make room in your character's stats (it does at your next level-up, quest reward or item pickup)"
	}
	return fmt.Sprintf("%s: %v", what, err)
}

// applyGrants gives the character everything beyond skill points: pooled stat points,
// Horadric Keys, gold, traps, and DeathLink.
//
// Targets (stat points, keys) are recomputed from the item counts each poll, so they
// converge however the items arrived. One-shot effects (gold, traps) are owed until
// recorded as applied, and are recorded only after the write has succeeded.
func (a *app) applyGrants(ctx context.Context, player uintptr) {
	a.mu.Lock()
	man := a.man
	pooled := a.statPointsPooled
	a.mu.Unlock()
	if man == nil {
		return
	}

	if pooled {
		a.applyStatPoints(player, man.Tables.BaseAttributes)
	}
	a.applyKeys(player, stat.ID(man.Tables.Stats.Keys))

	prog, ok := a.view().Progress()
	if !ok {
		return
	}
	dead, err := a.view().IsDead(player)
	if err != nil {
		return
	}
	a.reportDeath(ctx, dead)
	if dead {
		a.deathLanded()
		return // nothing below should land on a corpse
	}
	a.applyGold(player, prog.CharLevel)
	if game.IsTown(prog.AreaLevelID) {
		return // traps and incoming deaths wait until the character can actually be hurt
	}
	a.applyIncomingDeath(player)
	a.applyTraps(player)
}

// applyStatPoints holds unspent attribute points at (sent by Archipelago) - (spent).
func (a *app) applyStatPoints(player uintptr, classBase int) {
	sent := a.session.Count(ids.StatPointsItemID) * ids.StatPointsPerItem
	spent, err := a.view().SpentStatPoints(player, classBase)
	if err != nil {
		a.note("stat", "stat point accounting paused: "+err.Error())
		return
	}
	want := sent - spent
	if want < 0 {
		want = 0
	}
	if err := a.setOrGive(player, stat.StatPoints, uint32(want), 0); err != nil {
		a.note("stat", waitingForRoom(fmt.Sprintf("%d stat point(s)", want), err))
		return
	}
	a.note("stat", fmt.Sprintf("stat points: %d unspent (%d sent, %d spent)", want, sent, spent))
}

// applyKeys holds the key stat at the number of Horadric Keys received, plus one.
func (a *app) applyKeys(player uintptr, keyStat stat.ID) {
	keys := a.session.Count(ids.HoradricKeyItemID)
	a.mu.Lock()
	keyItems := a.keyItems // set by applySlotData on the connection's goroutine
	a.mu.Unlock()
	if keys == 0 && !keyItems {
		return
	}
	if err := a.setOrGive(player, keyStat, uint32(keys+1), 0); err != nil {
		a.note("keys", waitingForRoom(fmt.Sprintf("%d Horadric Key(s)", keys), err))
		return
	}
	a.note("keys", fmt.Sprintf("Horadric Keys: %d held (the Horadric Staff needs %d, Khalim's Will %d)",
		keys, ids.KeysForHoradricStaff, ids.KeysForKhalimsWill))
}

// applyGold hands over owed Gold items, one a poll.
func (a *app) applyGold(player uintptr, level int) {
	if a.session.Pending(ids.GoldItemID) == 0 {
		return
	}
	current, _, err := a.view().BaseStat(player, stat.Gold)
	if err != nil {
		return
	}
	next := game.GoldAfter(current, level)
	// Gold never takes the last free slot: a point pool spent to zero needs it back.
	if err := a.setOrGive(player, stat.Gold, next, 1); err != nil {
		a.note("gold", waitingForRoom("gold", err))
		return
	}
	if err := a.session.MarkApplied(ids.GoldItemID, 1); err == nil {
		logf("gold: +%d", next-current)
		a.note("gold", "")
	}
}

// applyTraps springs one owed trap a poll.
func (a *app) applyTraps(player uintptr) {
	for index, name := range ids.Traps {
		id := ids.TrapIDBase + int64(index)
		if a.session.Pending(id) == 0 {
			continue
		}
		if ids.Trap(index) == ids.TrapSkillLock {
			a.mu.Lock()
			a.skillLockUntil = time.Now().Add(skillLockDuration)
			a.mu.Unlock()
		} else {
			effect := map[ids.Trap]game.TrapEffect{
				ids.TrapManaBurn:       game.ManaBurn,
				ids.TrapExhaustion:     game.Exhaustion,
				ids.TrapBrushWithDeath: game.BrushWithDeath,
				ids.TrapGoldTax:        game.GoldTax,
			}[ids.Trap(index)]
			if _, err := a.view().Apply(player, effect); err != nil {
				return // try again next poll
			}
		}
		if err := a.session.MarkApplied(id, 1); err == nil {
			logf("TRAP: %s", name)
		}
		return
	}
}

// reportDeath tells the room when the character dies, once per death.
func (a *app) reportDeath(ctx context.Context, dead bool) {
	a.mu.Lock()
	wasDead := a.wasDead
	a.wasDead = dead
	enabled := a.deathLink
	ours := a.killedByLink
	if !dead {
		a.killedByLink = false
	}
	a.mu.Unlock()
	if !enabled || !dead || wasDead || ours {
		return
	}
	cause := fmt.Sprintf("%s died in Sanctuary", a.conn.Slot)
	send := a.conn.SendDeath
	if a.sendDeath != nil {
		send = a.sendDeath
	}
	if err := send(ctx, cause); err != nil {
		logf("DeathLink: could not send the death (%v)", err)
		return
	}
	logf("DeathLink: sent your death to the room")
}

// applyIncomingDeath carries out a death that arrived from another player.
//
// Whether writing life to nothing actually kills a character has not been confirmed in
// the game. So the write is checked: if the character is still alive after a few
// seconds, the death is downgraded to a Brush with Death and the client says so once,
// rather than writing zero forever.
func (a *app) applyIncomingDeath(player uintptr) {
	a.mu.Lock()
	pending := a.pendingDeaths
	since := a.killStarted
	unsupported := a.killUnsupported
	a.mu.Unlock()
	if pending == 0 {
		return
	}

	if unsupported {
		if _, err := a.view().Apply(player, game.BrushWithDeath); err == nil {
			a.finishDeath("DeathLink: applied as a Brush with Death")
		}
		return
	}
	if since.IsZero() {
		if _, err := a.view().Apply(player, game.Kill); err != nil {
			return
		}
		a.mu.Lock()
		a.killStarted = time.Now()
		a.killedByLink = true
		a.mu.Unlock()
		return
	}
	// Still alive (applyGrants returns before here once the character is dead).
	if time.Since(since) > killGrace {
		a.mu.Lock()
		a.killUnsupported = true
		a.killedByLink = false
		a.mu.Unlock()
		logf("DeathLink: the game did not treat an emptied life pool as a death.")
		logf("  Incoming deaths will leave you on one life instead.")
	}
}

func (a *app) finishDeath(message string) {
	a.mu.Lock()
	if a.pendingDeaths > 0 {
		a.pendingDeaths--
	}
	a.killStarted = time.Time{}
	a.mu.Unlock()
	logf("%s", message)
}

// deathLanded is called when the character is seen dead: a death in flight has arrived.
func (a *app) deathLanded() {
	a.mu.Lock()
	inFlight := !a.killStarted.IsZero()
	a.mu.Unlock()
	if inFlight {
		a.finishDeath("DeathLink: you died with the room")
	}
}

// note logs a line about one topic only when it changes, so a standing condition is
// stated once rather than every poll.
func (a *app) note(topic, message string) {
	a.mu.Lock()
	if a.notes == nil {
		a.notes = map[string]string{}
	}
	same := a.notes[topic] == message
	a.notes[topic] = message
	a.mu.Unlock()
	if !same && message != "" {
		logf("%s", message)
	}
}
