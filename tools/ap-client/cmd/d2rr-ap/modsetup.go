//go:build windows

package main

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/Dune172/d2r-skill-randomizer/tools/ap-client/internal/manifest"
	"github.com/Dune172/d2r-skill-randomizer/tools/ap-client/internal/setup"
	"golang.org/x/sys/windows"
)

// ensureMod downloads and loads the mod described by the room, once.
//
// slot_data is authoritative: the apworld chose the seed, class and savepath, and the
// mod must match them exactly or the manifest will describe skills the player does not
// have. Flags only override when explicitly given, for testing.
func (a *app) ensureMod(slotData map[string]any) error {
	a.mu.Lock()
	existing := a.man
	a.mu.Unlock()

	seedNum, ok := slotData["d2rr_seed"].(float64)
	seed := int(seedNum)
	class, _ := slotData["character_class"].(string)
	savepath, _ := slotData["savepath"].(string)
	if !ok || seedNum != float64(seed) || seed < 1 || class == "" || savepath == "" {
		return fmt.Errorf("room omitted seed, class or save folder")
	}
	options, _ := slotData["mod_options"].(map[string]any)
	if existing != nil {
		if err := existing.MatchRoom(seed, class, savepath); err != nil {
			return err
		}
		if err := a.prepareInstall(nil, existing); err != nil {
			return err
		}
		if a.saveDir == "" {
			if err := a.useManifest(existing); err != nil {
				return fmt.Errorf("local manifest could not be adopted: %w", err)
			}
		}
		a.setupOK = true
		return nil
	}

	// A fetch that succeeded is kept, so a retry after a failed install (D2R still
	// running, say) does not ask the server to build the whole mod again.
	zipBytes, man := a.fetchedZip, a.fetchedMan
	if man == nil || man.MatchRoom(seed, class, savepath) != nil {
		logf("room wants seed %d, class %s — requesting mod ...", seed, class)
		var err error
		zipBytes, man, err = manifest.Fetch(manifest.FetchRequest{
			BaseURL: a.baseURL, Seed: seed, CharacterClass: class, Savepath: savepath, Options: options,
		})
		if err != nil {
			return err
		}
		if err := man.MatchRoom(seed, class, savepath); err != nil {
			return err
		}
		// Kept from here on, so not even a failure to save the zip costs another build.
		a.fetchedZip, a.fetchedMan = zipBytes, man
		if err := os.MkdirAll(a.modOut, 0755); err != nil {
			return err
		}
		out := filepath.Join(a.modOut, man.ModName+".zip")
		if err := os.WriteFile(out, zipBytes, 0o644); err != nil {
			return fmt.Errorf("writing mod zip: %w", err)
		}
		logf("mod written to %s", out)
		if !a.installMod {
			logf(`INSTALL: rerun with -install (or -launch) to install and verify the downloaded mod:`)
			logf("  D2R.exe -mod %s -txt", man.ModName)
		}
	}

	if err := a.prepareInstall(zipBytes, man); err != nil {
		return err
	}
	if err := a.useManifest(man); err != nil {
		return err
	}
	a.setupOK = true
	a.fetchedZip, a.fetchedMan = nil, nil // a.man holds what is still needed
	return nil
}

// useManifest adopts a manifest and derives everything downstream of it.
func (a *app) useManifest(man *manifest.Manifest) error {
	expectedSaveDir := defaultSaveDir(man.Savepath)
	saveDir, err := resolveSaveDir(a.saveDirFlag, expectedSaveDir)
	if err != nil {
		return err
	}
	classIDs, err := man.ClassSkillIDs()
	if err != nil {
		return err
	}

	a.mu.Lock()
	a.man = man
	a.class = man.CharacterClass
	a.saveDir = saveDir
	a.classSkillIDs = classIDs
	a.mailbox = mailboxFor(man.Tables)
	a.mailOffer = 0
	a.mu.Unlock()

	logf("manifest: seed %d, class %s, savepath %s",
		man.Seed, man.CharacterClass, man.Savepath)
	logf("watching saves in %s", saveDir)
	if !strings.EqualFold(saveDir, expectedSaveDir) {
		logf("WARNING: watching %s because of -save-dir; this mod's own save folder is %s.", saveDir, expectedSaveDir)
		logf("         Checks are read from the bound character's save there, so make sure it is this slot's.")
	}

	// A missing save folder is the difference between "no checks yet" and "checks will
	// NEVER be detected" (an installed mod saving somewhere else), and the two look
	// identical in the log. The first is the normal start of a game, so say it calmly
	// and point at doctor for the second.
	if _, err := os.Stat(saveDir); os.IsNotExist(err) {
		logf("  (that folder appears when you create your character with this mod; if you")
		logf("   already have and nothing is detected, run \"d2rr-ap doctor\")")
	}

	a.recomputeDesired()
	return nil
}

// resolveSaveDir picks the folder watched for the character's save.
//
// Without -save-dir it is the mod's own folder under Saved Games. An explicit -save-dir
// wins (the NOTE above tells people to pass it when the installed mod saves somewhere
// else), but it must be a folder that exists: a typo would otherwise wait in silence for
// saves that never appear.
func resolveSaveDir(flagDir, expected string) (string, error) {
	if flagDir == "" {
		return expected, nil
	}
	dir, err := filepath.Abs(flagDir)
	if err != nil {
		return "", fmt.Errorf("-save-dir %s: %w", flagDir, err)
	}
	if info, err := os.Stat(dir); err != nil || !info.IsDir() {
		return "", fmt.Errorf("-save-dir %s is not an existing folder", flagDir)
	}
	return dir, nil
}

// retrySetup re-attempts the mod fetch using the slot_data we already have.
func (a *app) retrySetup() {
	a.mu.Lock()
	sd := a.slotData
	last := a.lastSetupTry
	failures := a.setupFailures
	a.mu.Unlock()

	if sd == nil || time.Since(last) < setupRetryDelay(failures) {
		return
	}
	a.mu.Lock()
	a.lastSetupTry = time.Now()
	a.mu.Unlock()

	if err := a.ensureMod(sd); err != nil {
		if errors.Is(err, errGameRunning) {
			// Waiting on the player, not on a server: keep checking every few seconds.
			a.warnAttach("close Diablo II: Resurrected to install this room's mod; " +
				"it is installed and the game started again as soon as it is closed")
			return
		}
		a.mu.Lock()
		a.setupFailures++
		a.mu.Unlock()
		a.warnAttach(fmt.Sprintf("cannot set up this slot's mod yet (retrying in %s): %v",
			setupRetryDelay(failures+1), err))
		return
	}
	a.mu.Lock()
	a.setupFailures = 0
	a.mu.Unlock()
}

// errGameRunning: the mod must be installed with the game closed.
var errGameRunning = errors.New("close D2R before installing or replacing mod files")

// setupRetryDelay spaces out setup retries: 5 s, doubling after each failure, at most
// 2 minutes. A failed fetch can mean the server is down or busy, and each try asks it
// to build a whole mod.
func setupRetryDelay(failures int) time.Duration {
	d := 5 * time.Second
	for i := 0; i < failures && d < 2*time.Minute; i++ {
		d *= 2
	}
	if d > 2*time.Minute {
		d = 2 * time.Minute
	}
	return d
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
			return errGameRunning
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

// defaultSaveDir is where D2R keeps the saves of a mod with this savepath.
func defaultSaveDir(savepath string) string {
	return filepath.Join(savedGamesDir(), "Diablo II Resurrected", "mods", savepath)
}

// savedGamesDir asks Windows for the Saved Games folder, which can be redirected (to
// OneDrive, another drive) and so is not always ~\Saved Games.
func savedGamesDir() string {
	if dir, err := windows.KnownFolderPath(windows.FOLDERID_SavedGames, 0); err == nil && dir != "" {
		return dir
	}
	if home, err := os.UserHomeDir(); err == nil {
		return filepath.Join(home, "Saved Games")
	}
	return "."
}
