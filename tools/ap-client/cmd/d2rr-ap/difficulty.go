//go:build windows

package main

import (
	"strings"
	"time"

	"github.com/Dune172/d2r-skill-randomizer/tools/ap-client/internal/save"
)

// Area checks need to know which difficulty the character is on, and the game says so
// nowhere this client has found to be reliable. So the difficulty comes from, in order:
//
//  1. -difficulty, for a command-line run;
//  2. /difficulty typed in the window, kept per room;
//  3. the calibrated memory field, once it has a sample from Normal and from a higher
//     difficulty (Normal is sampled by itself; /difficulty supplies the other);
//  4. the save, while only Normal is unlocked.
//
// Once 3 works, a /difficulty choice is cleared: memory follows the player between
// difficulties, and a fixed choice does not.

// warnDifficulty reports an undeterminable difficulty at most once a minute.
//
// This must not be silent: area checks are most of the location pool, so a room whose
// area checks never send is unwinnable for everyone in it, and the only place that
// surfaces is here.
func (a *app) warnDifficulty(reason string) {
	a.mu.Lock()
	quiet := time.Since(a.lastDiffWarn) < time.Minute
	if !quiet {
		a.lastDiffWarn = time.Now()
	}
	a.mu.Unlock()
	if !quiet {
		logf("area checks PAUSED: the app cannot tell which difficulty you are on (%s).", reason)
		logf("  Type /difficulty normal, /difficulty nightmare or /difficulty hell in this window.")
	}
}

// difficultyName is a difficulty as the game shows it: Normal, Nightmare, Hell.
func difficultyName(d int) string {
	if d >= 0 && d < len(save.DifficultyNames) {
		name := save.DifficultyNames[d]
		return strings.ToUpper(name[:1]) + name[1:]
	}
	return "?"
}

func (a *app) currentDifficulty(st *save.State) save.DifficultyResult {
	a.mu.Lock()
	goal := a.goalDifficulty
	fresh := a.newCharacter
	a.mu.Unlock()
	if a.difficultyOverride >= 0 {
		a.difficultySource = "chosen with /difficulty"
		if a.difficultyFlag >= 0 {
			a.difficultySource = "-difficulty flag"
		}
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
	var result save.DifficultyResult
	if st == nil && fresh && goal >= 0 {
		result = save.DifficultyResult{Difficulty: 0, OK: true, Source: save.SourceNewCharacter}
	} else {
		result = save.CurrentDifficulty(goal, -1, st)
	}
	a.difficultySource = result.Source.String()
	// Certainly Normal: nothing beyond it is unlocked. Keep a sample of the memory
	// field, so one /difficulty on a higher difficulty later is enough to calibrate it.
	if result.OK && result.Difficulty == 0 &&
		(result.Source == save.SourceNewCharacter || result.Source == save.SourceSingleDifficulty) {
		a.sampleDifficulty(0)
	}
	return result
}

// sampleDifficulty records the memory field while the character is known to be on d,
// and reports whether memory now tells difficulties apart by itself.
func (a *app) sampleDifficulty(d int) bool {
	if a.gc == nil || a.player == 0 || a.difficultyProfile.Build == "" {
		return false
	}
	if d == 0 {
		// Taken by itself while Normal is certain: once per character is enough.
		if _, ok := a.difficultyProfile.Samples[0]; ok || a.normalSampledFor == a.player {
			return false
		}
		a.normalSampledFor = a.player
	}
	if a.difficultyProfile.Observe(d, a.gc.DifficultyCandidates(a.player)) != nil {
		return false
	}
	// Unsaved, the sample still counts until the app closes.
	_ = a.difficultyProfile.Save(a.stateDir)
	_, ok := a.difficultyProfile.Layout()
	return ok
}

// handleCommand carries out a line typed in the window. It runs on the poll loop, so it
// may touch the game state the poll uses.
func (a *app) handleCommand(cmd consoleCommand) {
	switch cmd.name {
	case "help":
		printConsoleHelp()
	case "connected":
		a.loadDifficultyChoice()
	case "difficulty":
		a.chooseDifficulty(cmd.arg)
	}
}

// loadDifficultyChoice applies this room's saved /difficulty choice and, for a room whose
// goal is past Normal, says once how to keep area checks right.
func (a *app) loadDifficultyChoice() {
	if a.difficultyFlag < 0 {
		if d := a.session.DifficultyChoice(); d >= 0 {
			a.difficultyOverride = d
			logf("area checks are filed on %s (your /difficulty choice; /difficulty auto undoes it)", difficultyName(d))
		}
	}
	a.mu.Lock()
	goal := a.goalDifficulty
	a.mu.Unlock()
	if goal > 0 && !a.difficultyHinted && a.difficultyOverride < 0 {
		a.difficultyHinted = true
		logf("This room's goal is on %s. Once you have beaten Baal on Normal, type", difficultyName(goal))
		logf("  /difficulty nightmare (or hell) in this window while playing it, so area checks are")
		logf("  filed on the right difficulty. Once is usually enough: the app learns to tell by itself.")
	}
}

// chooseDifficulty is /difficulty: pin area checks to a difficulty, or "auto".
func (a *app) chooseDifficulty(arg string) {
	if arg == "" {
		switch {
		case a.difficultyFlag >= 0:
			logf("area checks are filed on %s (the -difficulty flag)", difficultyName(a.difficultyOverride))
		case a.difficultyOverride >= 0:
			logf("area checks are filed on %s (your /difficulty choice; /difficulty auto undoes it)",
				difficultyName(a.difficultyOverride))
		default:
			source := a.difficultySource
			if source == "" {
				source = "no character loaded yet"
			}
			logf("area checks: the app works it out (%s). Type /difficulty normal, nightmare or hell to set it", source)
		}
		return
	}
	d, err := parseDifficultyArg(arg)
	if err != nil {
		logf("%v", err)
		return
	}
	if a.difficultyFlag >= 0 {
		logf("this run was started with -difficulty %d, which wins; restart without it to use /difficulty", a.difficultyFlag)
		return
	}
	a.mu.Lock()
	goal := a.goalDifficulty
	a.mu.Unlock()
	if d > goal && goal >= 0 {
		logf("this room ends on %s, so it has no %s checks", difficultyName(goal), difficultyName(d))
		return
	}
	if d >= 0 && a.sampleDifficulty(d) {
		a.difficultyOverride = -1
		_ = a.session.SetDifficultyChoice(-1)
		logf("Thanks: the app can now tell the difficulty by itself on this computer, so nothing needs")
		logf("  typing when you switch. If area checks ever look wrong, type /difficulty again.")
		return
	}
	a.difficultyOverride = d
	if err := a.session.SetDifficultyChoice(d); err != nil {
		logf("could not save the choice (%v); it lasts until the app is closed", err)
	}
	if d < 0 {
		logf("area checks: the app works out the difficulty itself again")
		return
	}
	logf("area checks are now filed on %s. Type /difficulty again when you change difficulty.", difficultyName(d))
}
