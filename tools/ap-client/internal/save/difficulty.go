package save

// Which difficulty the character is CURRENTLY playing.
//
// Quest and waypoint checks never needed this: the .d2s stores three separate blocks, so
// each one is self-labelling. AREA checks do — the game reports which area you are
// standing in and nothing about which difficulty you are standing in it on. Attributing
// an area to the wrong difficulty is not cosmetic: the correct location is never sent,
// which strands whatever item fill placed there, and in a multiworld that is somebody
// else's progression.
//
// WHAT WAS TRIED, AND WHY THERE IS NO AUTOMATIC ANSWER YET.
//
// Two candidate signals were measured against 124 real save files and both were rejected:
//
//   - The per-difficulty automap files (<char>.ma0/.ma1/.ma2). The 130/23/11 split looked
//     exactly like a player base that mostly stays on Normal. But 23 characters have a
//     .ma1 and NOT ONE of the 124 has completed Normal Baal, which is impossible if .ma1
//     meant Nightmare.
//   - A Difficulty[3] field in the header, as classic D2 keeps at 0xA8. A brute-force
//     scan found offset 0x098 matching the signature (one of three bytes with 0x80 set,
//     low nibble a valid act) on 119 of 124 saves. It fails the same way: the two saves
//     it calls Nightmare have completely empty Nightmare quest blocks.
//
// The corpus cannot settle it, because nothing in it has ever finished Normal — so there
// is no character whose true difficulty is known to be anything but Normal. Rather than
// ship an inference that cannot be checked, difficulty is resolved from what IS certain,
// and anything uncertain is reported instead of guessed.
const automapSlots = Difficulties

// Baal's quest, whose completion unlocks the next difficulty. Mirrors ids.BAAL_ACT and
// ids.BAAL_QUEST_INDEX; TestBaalMatchesIDContract keeps them honest.
const (
	baalAct        = 4
	baalQuestIndex = 5
)

// DifficultySource records how a difficulty was arrived at, so the log can say.
type DifficultySource int

const (
	// SourceUnknown means no difficulty could be established.
	SourceUnknown DifficultySource = iota
	SourceMemory
	// SourceSingleDifficulty means the room only has one, so there is nothing to infer.
	SourceSingleDifficulty
	// SourceOverride means the player told the client explicitly.
	SourceOverride
	// SourceUnlocked means it was taken to be the highest difficulty the save proves is
	// unlocked — correct while advancing, WRONG while farming a finished difficulty.
	SourceUnlocked
)

func (s DifficultySource) String() string {
	switch s {
	case SourceMemory:
		return "calibrated memory"
	case SourceSingleDifficulty:
		return "only difficulty in this room"
	case SourceOverride:
		return "-difficulty override"
	case SourceUnlocked:
		return "highest unlocked (assumed)"
	default:
		return "unknown"
	}
}

// DifficultyResult explains a determination so an unreliable one can be reported.
type DifficultyResult struct {
	Difficulty int
	OK         bool
	Source     DifficultySource
	// Unlocked is the highest difficulty the save proves the character can enter.
	Unlocked int
	// Reason is filled in when OK is false.
	Reason string
}

// CurrentDifficulty determines which difficulty is being played.
//
//   - goalDifficulty is the room's goal. When it is Normal the answer is exact: the room
//     contains no other difficulty, so there is nothing to get wrong. This is why a
//     Normal-goal room is the one to test with.
//   - override is a difficulty the player supplied, or -1. It wins over inference,
//     because a person looking at their own screen is a better source than any of the
//     signals measured above.
//   - Otherwise it falls back to the highest difficulty the save proves is unlocked,
//     which is right while advancing and wrong while farming a finished difficulty. The
//     caller is expected to say so out loud.
func CurrentDifficulty(goalDifficulty, override int, st *State) DifficultyResult {
	unlocked := HighestUnlockedDifficulty(st)
	if goalDifficulty < 0 || goalDifficulty >= Difficulties {
		return DifficultyResult{Reason: "room goal is unavailable"}
	}
	if override >= 0 {
		if override >= Difficulties || override > goalDifficulty {
			return DifficultyResult{Reason: "selected difficulty is outside this room", Unlocked: unlocked}
		}
		return DifficultyResult{Difficulty: override, OK: true, Source: SourceOverride, Unlocked: unlocked}
	}
	if st == nil {
		return DifficultyResult{Reason: "waiting for the game to save your character, which it does soon after you start playing"}
	}
	if unlocked == 0 {
		return DifficultyResult{Difficulty: 0, OK: true, Source: SourceSingleDifficulty}
	}
	return DifficultyResult{Reason: "multiple difficulties are unlocked; use a calibrated memory profile or -difficulty", Unlocked: unlocked}
}

// NeedsOverrideWarning reports whether the caller should tell the player that area
// checks are running on an assumption that breaks if they go back to farm.
func (r DifficultyResult) NeedsOverrideWarning() bool {
	return r.OK && r.Source == SourceUnlocked && r.Unlocked > 0
}

// HighestUnlockedDifficulty is the hardest difficulty the character may legally enter.
//
// Beating Baal on a difficulty unlocks the next, so this is one above the highest
// completed Baal, capped at Hell.
func HighestUnlockedDifficulty(st *State) int {
	highest := 0
	if st == nil {
		return highest
	}
	for _, q := range st.CompletedQuests {
		if q.Act == baalAct && q.Index == baalQuestIndex && q.Difficulty+1 > highest {
			highest = q.Difficulty + 1
		}
	}
	if highest > Difficulties-1 {
		highest = Difficulties - 1
	}
	return highest
}
