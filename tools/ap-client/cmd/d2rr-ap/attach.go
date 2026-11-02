//go:build windows

package main

import (
	"context"
	"fmt"
	"path/filepath"
	"strings"
	"time"

	"github.com/Dune172/d2r-skill-randomizer/tools/ap-client/internal/game"
	"github.com/Dune172/d2r-skill-randomizer/tools/ap-client/internal/ids"
	"github.com/Dune172/d2r-skill-randomizer/tools/ap-client/internal/save"
	"github.com/Dune172/d2r-skill-randomizer/tools/ap-client/internal/setup"
)

// pollGame verifies the mod and bound character before writing a point balance.
func (a *app) pollGame(ctx context.Context) {
	if a.gc == nil {
		// Attaching scans every process and the game's whole module, so a condition
		// that keeps it failing (no game, a game started without the mod) must not
		// repeat it every poll.
		if time.Now().Before(a.attachNotBefore) {
			return
		}
		// Waiting for the game to start costs only a look at the process list, so it is
		// done every second; the backoff is for a game that is running and refuses.
		if !setup.GameRunning() {
			a.reattaching = false
			a.attachFailures = 0
			a.attachNotBefore = time.Now().Add(time.Second)
			a.warnAttach("waiting for Diablo II: Resurrected to start")
			return
		}
		if !a.attachGame() {
			a.attachFailures++
			a.attachNotBefore = time.Now().Add(attachRetryDelay(a.attachFailures))
			return
		}
		a.attachFailures = 0
	}

	player := a.gc.PlayerUnit()
	// IsOnline walks the game's whole panel tree, so it is asked when the character
	// changes and every few seconds, not every poll. An AP mod cannot go online anyway.
	if player != a.onlineCheckedFor || time.Since(a.onlineCheckedAt) > onlineCheckInterval {
		a.online = a.gc.IsOnline()
		a.onlineCheckedFor = player
		a.onlineCheckedAt = time.Now()
	}
	if a.online {
		a.resetPlayer()
		a.warnAttach("enter an offline character in the room's mod")
		return
	}
	if player == 0 {
		wasAttached := a.attached
		a.resetPlayer()
		if wasAttached {
			logf("left the game; waiting for a character")
		}
		a.attached = false

		// RE-ATTACH if this persists. d2go resolves its offsets exactly once, by
		// pattern-scanning the module when the process is opened. Attaching while D2R
		// is still starting up can bake in a bad unit-table offset, and a bad unit
		// table is indistinguishable from an empty one — the client reports "no
		// character loaded" forever while the player is demonstrably in a game, and
		// a tool that attaches fresh (doctor, probe) resolves the same character fine.
		//
		// A fresh attach re-runs the scan, so the recovery is simply to stop reusing
		// the old one.
		// Quietly: at the menu this happens every 10 s, and it is routine.
		if a.noPlayerSince.IsZero() {
			a.noPlayerSince = time.Now()
		} else if time.Since(a.noPlayerSince) > 10*time.Second {
			a.reattaching = true
			a.gc.Close()
			a.gc = nil
			a.noPlayerSince = time.Time{}
			return
		}

		a.warnAttach("Diablo II is running: load your character in Offline mode to continue")
		return
	}
	a.noPlayerSince = time.Time{}
	name, err := a.gc.CharacterName(player)
	cls, classErr := a.gc.ReadClass(player)
	if err != nil || classErr != nil {
		a.attached = false
		a.warnAttach("the loaded character could not be read yet")
		return
	}
	if cls < 0 || cls >= len(ids.Classes) || ids.Classes[cls] != a.class {
		a.attached = false
		a.warnAttach(fmt.Sprintf("%s is not a %s: this room plays a %s. Load the room's %s, "+
			"or create one with this mod", name, className(a.class), className(a.class), className(a.class)))
		return
	}
	if a.characterFlag != "" && name != a.characterFlag {
		a.attached = false
		a.warnAttach("loaded character differs from -character")
		return
	}
	if bound := a.session.CharacterName(); bound != "" && name != bound {
		a.attached = false
		a.warnAttach(fmt.Sprintf("slot is bound to %s; loaded %s", bound, name))
		return
	}
	if err := a.bindCurrentCharacter(name); err != nil {
		a.attached = false
		a.warnAttach(err.Error())
		return
	}
	if name != a.session.CharacterName() {
		a.attached = false
		a.warnAttach("loaded character differs from the selected save")
		return
	}
	if a.player != player {
		a.resetPlayer()
		a.player = player
	}
	a.attached = true
	if !a.offsetsResolved() {
		return
	}
	if a.gc.QuitMenuOpen() {
		return
	} // avoid writing during exit; there are no nodes to unlink
	a.showMessages()
	if !a.conn.Synchronized() {
		a.warnAttach("waiting for the server's complete item replay before granting points")
		return
	}

	if a.dryRun {
		return
	}

	a.applySkillPoints(player)
	a.applyGrants(ctx, player)
}

// offsetsResolved reports whether the UI block is known, which every write waits on,
// and re-attaches while it or the waypoint panel is not: after 30 s, then backing off
// to at most every 10 minutes, and only a few times when just the waypoint panel is
// missing (grants work then, and the save still reports waypoints).
//
// Without this an unknown D2R build looks exactly like a working client: checks keep
// arriving from the save while QuitMenuOpen stays true forever and no grant is made.
func (a *app) offsetsResolved() bool {
	ui, waypoints := a.gc.OffsetsResolved()
	if ui && waypoints {
		a.offsetsMissingSince = time.Time{}
		a.offsetsRetries = 0
		a.note("offsets", "")
		return true
	}
	build := a.gc.BuildTimestamp()
	if !ui {
		// Through warnAttach: grants stop here, so this is why the game side is idle.
		a.warnAttach(fmt.Sprintf("D2R build 0x%08x: the UI block was not found, so nothing "+
			"is granted (checks still send). %s", build, buildHint(build)))
	} else {
		// Grants go on, and their success clears warnAttach's throttle every poll, so a
		// note (logged once per change) is the one that stays quiet.
		a.note("offsets", fmt.Sprintf("D2R build 0x%08x: the waypoint panel was not found, so "+
			"waypoint checks wait for the save. %s", build, buildHint(build)))
	}
	if !ui || a.offsetsRetries < maxWaypointOnlyRetries {
		if a.offsetsMissingSince.IsZero() {
			a.offsetsMissingSince = time.Now()
		} else if time.Since(a.offsetsMissingSince) > reattachDelay(a.offsetsRetries) {
			// A fresh attach scans the module again, and a code page that had not run
			// before may be readable now. Forget everything learned from the old
			// offsets: a quest layout calibrated on them must not be trusted after a
			// rescan that may have missed (it would send checks never earned).
			a.offsetsMissingSince = time.Time{}
			a.offsetsRetries++
			a.reattaching = true
			a.resetPlayer()
			a.detachGame()
			return false
		}
	}
	return ui
}

// maxWaypointOnlyRetries bounds re-attaching when only the waypoint panel is missing.
const maxWaypointOnlyRetries = 3

// reattachDelay is how long offsets stay missing before re-attach number n+1:
// 30 s, then doubling, at most 10 minutes. Each re-attach rescans the whole module.
func reattachDelay(n int) time.Duration {
	d := 30 * time.Second
	for i := 0; i < n && d < 10*time.Minute; i++ {
		d *= 2
	}
	if d > 10*time.Minute {
		d = 10 * time.Minute
	}
	return d
}

func buildHint(build uint32) string {
	if game.KnownBuild(build) {
		return "Retrying."
	}
	return "This build has no measured offsets; retrying, and it may need a client update."
}

func (a *app) detachGame() {
	if a.gc == nil {
		return
	}
	a.gc.Close()
	a.gc = nil
	a.onlineCheckedAt = time.Time{}
}

// attachGame opens the running game and checks it is the room's mod. The check (the
// process's command line, every installed mod file's hash, the executable's hash) is
// done once per game process: re-attaching to the same process, which happens every
// 10 s at the character screen, only redoes d2go's offset scan.
func (a *app) attachGame() bool {
	gc, err := game.Attach()
	if err != nil {
		// Report it. Silence here is indistinguishable from "the game is not running",
		// and it hides the case that matters: attached-but-refused, where checks keep
		// flowing from the save while no skill is ever granted.
		a.reattaching = false
		switch {
		case setup.GameElevated():
			a.warnAttach("Diablo II: Resurrected is running as administrator, so this app cannot " +
				"reach it. Close this window and open the app as administrator too " +
				"(right-click, Run as administrator), or start the game normally")
		default:
			a.warnAttach(fmt.Sprintf("cannot attach to D2R: %v", err))
		}
		return false
	}
	if pid := gc.PID(); pid != a.verifiedPID {
		proc, err := setup.Inspect(pid)
		if err == nil {
			err = setup.VerifyProcess(proc, a.man)
		}
		if err != nil {
			a.reattaching = false
			a.warnAttach(fmt.Sprintf("game verification: %v", err))
			gc.Close()
			return false
		}
		if build, e := setup.ExecutableHash(proc.ExecutablePath); e == nil {
			a.difficultyProfile, _ = game.LoadDifficultyProfile(a.stateDir, build)
		}
		a.verifiedPID = pid
	}
	a.gc = gc
	if !a.reattaching {
		a.clearAttachWarning()
		logf("attached to D2R")
	}
	a.reattaching = false
	return true
}

// onlineCheckInterval spaces out the Battle.net check, which reads every UI panel.
const onlineCheckInterval = 3 * time.Second

// attachRetryDelay is the wait before attach attempt n+1 after n failures in a row:
// 1 s, doubling, at most 30 s. A game that has just started is found within a second or
// two; one that keeps failing verification is not rescanned twice a second.
func attachRetryDelay(failures int) time.Duration {
	d := time.Second
	for i := 1; i < failures && d < 30*time.Second; i++ {
		d *= 2
	}
	if d > 30*time.Second {
		d = 30 * time.Second
	}
	return d
}

// classNames are the game's names for ids.Classes.
var classNames = map[string]string{
	"ama": "Amazon", "sor": "Sorceress", "nec": "Necromancer", "pal": "Paladin",
	"bar": "Barbarian", "dru": "Druid", "ass": "Assassin", "war": "Warlock",
}

func className(code string) string {
	if name, ok := classNames[code]; ok {
		return name
	}
	return code
}

func selectSave(dir, name string) (string, error) {
	paths, e := filepath.Glob(filepath.Join(dir, "*.d2s"))
	if e != nil {
		return "", e
	}
	if name == "" {
		if len(paths) != 1 {
			return "", fmt.Errorf("found %d saves; pass -character to select one and enter that character", len(paths))
		}
		return paths[0], nil
	}
	// Never treat a character supplied via a flag or remote state as a path.
	for _, p := range paths {
		if strings.EqualFold(strings.TrimSuffix(filepath.Base(p), filepath.Ext(p)), name) {
			return p, nil
		}
	}
	return "", fmt.Errorf("save for character %q is not in %s", name, dir)
}

func (a *app) characterSave(dir string) (string, error) {
	name := a.session.CharacterName()
	if name == "" {
		return "", fmt.Errorf("load your character in Offline mode to start (a new character of this room's class, made with this mod)")
	}
	if a.characterFlag != "" && name != a.characterFlag {
		return "", fmt.Errorf("-character differs from this slot's saved character binding")
	}
	return selectSave(dir, name)
}

func (a *app) bindCurrentCharacter(name string) error {
	expected := a.session.CharacterName()
	if expected == "" {
		expected = a.characterFlag
	}
	// Nothing chosen yet: the character the player loaded is the choice. Asking for
	// "the only save" failed as soon as the folder held two, such as the ready-made
	// Open Acts character next to one the player created, and a double-clicked app has
	// no -character flag to settle it.
	if expected == "" {
		expected = name
	}
	path, e := selectSave(a.saveDir, expected)
	if e != nil {
		return e
	}
	// A new character's save is a header only until the game first saves it in full,
	// which can take many minutes; the header names the character, which is enough.
	saved, e := save.ReadFileName(path)
	if e != nil {
		return fmt.Errorf("waiting for a readable character save: %w", e)
	}
	if saved != name {
		return fmt.Errorf("selected save belongs to %s; enter that character", saved)
	}
	if e = a.session.BindCharacter(name); e != nil {
		return e
	}
	return nil
}

func (a *app) resetPlayer() {
	a.player = 0
	a.attached = false
	a.pointSampleOK = false
	a.questLayoutOK = false
	a.warnedNoLayout = false
	a.lastState = nil
}
