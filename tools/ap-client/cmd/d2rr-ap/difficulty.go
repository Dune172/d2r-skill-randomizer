package main

import (
	"time"

	"github.com/swannysoft/d2rr-ap-client/internal/save"
)

// warnAssumedDifficulty fires once when area checks start running on an assumption.
//
// The assumption is that you are playing the hardest difficulty you have unlocked. That
// holds while advancing and breaks the moment you go back to farm, so it must be visible
// rather than quietly wrong.
func (a *app) warnAssumedDifficulty(res save.DifficultyResult) {
	a.mu.Lock()
	already := a.warnedAssumed
	a.warnedAssumed = true
	a.mu.Unlock()
	if already {
		return
	}
	logf("area checks assume you are playing %s (the highest difficulty you have unlocked).",
		save.DifficultyNames[res.Difficulty])
	logf("  If you go back to farm an easier difficulty, restart with -difficulty %d..%d",
		0, res.Unlocked)
	logf("  so the checks are filed correctly.")
}

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
		logf("area checks PAUSED: cannot determine the current difficulty (%s)", reason)
	}
}

func difficultyName(d int) string {
	if d >= 0 && d < len(save.DifficultyNames) {
		return save.DifficultyNames[d]
	}
	return "?"
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
