package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/swannysoft/d2rr-ap-client/internal/game"
	"github.com/swannysoft/d2rr-ap-client/internal/manifest"
	"github.com/swannysoft/d2rr-ap-client/internal/save"
	"github.com/swannysoft/d2rr-ap-client/internal/setup"
)

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
func (a *app) prepareInstall(data []byte, m *manifest.Manifest) error {
	if !a.installMod {
		return nil
	}
	root, e := setup.Detect(a.gameDir)
	if e != nil {
		return e
	}
	if e = setup.VerifyInstalled(root, m); e != nil {
		if len(data) == 0 {
			file := a.localManifest
			if file == "" || !strings.EqualFold(filepath.Ext(file), ".zip") {
				file = filepath.Join(a.modOut, m.ModName+".zip")
			}
			data, e = os.ReadFile(file)
			if e != nil {
				return fmt.Errorf("installation needs the complete mod zip: %w", e)
			}
		}
		if setup.GameRunning() {
			return fmt.Errorf("close D2R before installing or replacing mod files")
		}
		dest, e := setup.Install(root, data, m)
		if e != nil {
			return e
		}
		logf("installed and verified %s", dest)
	}
	a.gameDir = root
	if a.launchGame && !setup.GameRunning() {
		if e = setup.Launch(root, m); e != nil {
			return e
		}
		logf("launched %s", m.ModName)
	}
	a.launchGame = false
	return nil
}

func (a *app) currentDifficulty(st *save.State) save.DifficultyResult {
	a.mu.Lock()
	goal := a.goalDifficulty
	a.mu.Unlock()
	if a.difficultyOverride >= 0 {
		a.difficultySource = "explicit override"
		return save.CurrentDifficulty(goal, a.difficultyOverride, st)
	}
	if a.gc != nil && a.player != 0 {
		if value, ok := a.difficultyProfile.Resolve(a.gc.DifficultyCandidates(a.player)); ok {
			if value > goal {
				return save.DifficultyResult{Reason: "current difficulty is beyond this room's goal"}
			}
			a.difficultySource = "calibrated memory"
			return save.DifficultyResult{Difficulty: value, OK: true, Source: save.SourceMemory, Unlocked: save.HighestUnlockedDifficulty(st)}
		}
	}
	result := save.CurrentDifficulty(goal, -1, st)
	a.difficultySource = result.Source.String()
	return result
}

type statusReport struct {
	Time                                                           string `json:"time"`
	Room                                                           string `json:"room"`
	StateFile                                                      string `json:"stateFile"`
	Connected, ItemStreamSynchronized, ModReady, CharacterAttached bool
	Character                                                      string
	Points                                                         game.PointBalance
	DifficultySource                                               string
	PausedReason                                                   string
}

func (a *app) writeStatus() {
	if a.statusFile == "" || time.Since(a.lastStatus) < time.Second {
		return
	}
	a.lastStatus = time.Now()
	a.mu.Lock()
	reason := a.lastAttachWarn
	a.mu.Unlock()
	report := statusReport{Time: time.Now().UTC().Format(time.RFC3339), Room: a.session.Identity(), StateFile: a.session.StatePath(), Connected: a.conn.Connected(), ItemStreamSynchronized: a.conn.Synchronized(), ModReady: a.setupOK, CharacterAttached: a.attached, Character: a.session.CharacterName(), Points: a.balance, DifficultySource: a.difficultySource, PausedReason: reason}
	raw, e := json.MarshalIndent(report, "", "  ")
	if e == nil {
		e = os.WriteFile(a.statusFile+".tmp", raw, 0600)
	}
	if e == nil {
		e = os.Rename(a.statusFile+".tmp", a.statusFile)
	}
	if e != nil {
		logf("writing status: %v", e)
	}
}
