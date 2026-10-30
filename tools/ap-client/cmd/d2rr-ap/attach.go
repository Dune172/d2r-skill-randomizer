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
		gc, err := game.Attach()
		if err != nil {
			// Report it ONCE. Silence here is indistinguishable from "the game is not
			// running", and it hides the case that actually matters: attached-but-
			// refused, where checks keep flowing from the save while no skill is ever
			// granted. That looked exactly like a broken grant path.
			a.reattaching = false
			if !setup.GameRunning() {
				a.warnAttach("waiting for Diablo II: Resurrected to start")
			} else {
				a.warnAttach(fmt.Sprintf("cannot attach to D2R: %v", err))
			}
			return
		}
		proc, err := setup.Inspect(gc.PID())
		if err == nil {
			err = setup.VerifyProcess(proc, a.man)
		}
		if err != nil {
			a.reattaching = false
			a.warnAttach(fmt.Sprintf("game verification: %v", err))
			gc.Close()
			return
		}
		if build, e := setup.ExecutableHash(proc.ExecutablePath); e == nil {
			a.difficultyProfile, _ = game.LoadDifficultyProfile(a.stateDir, build)
		}
		a.gc = gc
		if !a.reattaching {
			a.clearAttachWarning()
			logf("attached to D2R")
		}
		a.reattaching = false
	}

	if a.gc.IsOnline() {
		a.resetPlayer()
		a.warnAttach("enter an offline character in the room's mod")
		return
	}
	player := a.gc.PlayerUnit()
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
	if err != nil || classErr != nil || cls < 0 || cls >= len(ids.Classes) || ids.Classes[cls] != a.class {
		a.attached = false
		a.warnAttach("loaded character class/name does not match the room")
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
