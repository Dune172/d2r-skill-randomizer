package main

import (
	"context"
	"fmt"
	"path/filepath"
	"strings"
	"time"

	"github.com/swannysoft/d2rr-ap-client/internal/game"
	"github.com/swannysoft/d2rr-ap-client/internal/ids"
	"github.com/swannysoft/d2rr-ap-client/internal/save"
	"github.com/swannysoft/d2rr-ap-client/internal/setup"
)

// pollGame verifies the mod and bound character before writing a point balance.
func (a *app) pollGame() {
	if a.gc == nil {
		gc, err := game.Attach()
		if err != nil {
			// Report it ONCE. Silence here is indistinguishable from "the game is not
			// running", and it hides the case that actually matters: attached-but-
			// refused, where checks keep flowing from the save while no skill is ever
			// granted. That looked exactly like a broken grant path.
			a.warnAttach(fmt.Sprintf("cannot attach to D2R: %v", err))
			return
		}
		proc, err := setup.Inspect(gc.PID())
		if err == nil {
			err = setup.VerifyProcess(proc, a.man)
		}
		if err != nil {
			a.warnAttach(fmt.Sprintf("game verification: %v", err))
			gc.Close()
			return
		}
		a.process = proc
		if build, e := setup.ExecutableHash(proc.ExecutablePath); e == nil {
			a.difficultyProfile, _ = game.LoadDifficultyProfile(a.stateDir, build)
		}
		a.gc = gc
		a.clearAttachWarning()
		logf("attached to D2R")
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
		// cmd/grant, which attaches fresh every run, resolves the same character fine.
		//
		// A fresh attach re-runs the scan, so the recovery is simply to stop reusing
		// the old one.
		if a.noPlayerSince.IsZero() {
			a.noPlayerSince = time.Now()
		} else if time.Since(a.noPlayerSince) > 10*time.Second {
			logf("no character after 10s; re-attaching in case the offsets resolved badly")
			a.gc.Close()
			a.gc = nil
			a.noPlayerSince = time.Time{}
			return
		}

		a.warnAttach("attached to D2R but no character is loaded " +
			"(you are at the menu, or the game is still loading)")
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
	a.applyGrants(context.Background(), player)
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
		return "", fmt.Errorf("enter the selected character to bind this slot before sending checks")
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
	st, e := save.ParseFile(path)
	if e != nil {
		return fmt.Errorf("waiting for a readable character save: %w", e)
	}
	if st.Name != name {
		return fmt.Errorf("selected save belongs to %s; enter that character", st.Name)
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
