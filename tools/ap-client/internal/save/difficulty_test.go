package save

import (
	"testing"
)

// Attributing an area to the wrong difficulty strands the correct location forever, so
// these are about never producing a confident wrong answer.

func baalDone(difficulties ...int) *State {
	st := &State{Name: "Tester"}
	for _, d := range difficulties {
		st.CompletedQuests = append(st.CompletedQuests,
			Quest{Difficulty: d, Act: baalAct, Index: baalQuestIndex, Name: "Eve of Destruction"})
	}
	return st
}

// A Normal-goal room contains Normal locations and nothing else, so an area can only
// belong to Normal. This is the configuration to test with, and the only one where the
// answer is exact rather than assumed.
func TestNormalGoalIsExact(t *testing.T) {
	got := CurrentDifficulty(0, -1, baalDone())
	if !got.OK || got.Difficulty != 0 {
		t.Fatalf("got %+v, want difficulty 0", got)
	}
	if got.Source != SourceSingleDifficulty {
		t.Errorf("source = %v, want the single-difficulty case", got.Source)
	}
	if got.NeedsOverrideWarning() {
		t.Error("a Normal-goal room needs no warning; nothing is being assumed")
	}
}

func TestNormalGoalDoesNotRelabelHigherDifficultyAsNormal(t *testing.T) {
	if got := CurrentDifficulty(0, -1, baalDone(0, 1)); got.OK {
		t.Fatalf("guessed difficulty: %+v", got)
	}
}

func TestOverrideWins(t *testing.T) {
	got := CurrentDifficulty(2, 1, baalDone())
	if !got.OK || got.Difficulty != 1 || got.Source != SourceOverride {
		t.Fatalf("got %+v, want difficulty 1 from the override", got)
	}
}

func TestOutOfRangeOverrideIsRefused(t *testing.T) {
	got := CurrentDifficulty(2, 3, baalDone())
	if got.OK {
		t.Fatalf("accepted an out-of-range override: %+v", got)
	}
	if got.Reason == "" {
		t.Error("a refusal must explain itself; the log is the only place this surfaces")
	}
}

func TestUnknownDifficultyPausesAfterUnlock(t *testing.T) {
	for _, st := range []*State{nil, baalDone(0), baalDone(0, 1)} {
		if got := CurrentDifficulty(2, -1, st); got.OK || got.Reason == "" {
			t.Fatalf("expected explained pause, got %+v", got)
		}
	}
}
func TestOverrideBeyondGoalIsRefused(t *testing.T) {
	if got := CurrentDifficulty(0, 1, baalDone(0)); got.OK {
		t.Fatal("accepted checks beyond room goal")
	}
}

func TestUnlockedDifficultyFollowsBaal(t *testing.T) {
	for _, c := range []struct {
		beaten []int
		want   int
	}{
		{nil, 0},
		{[]int{0}, 1},
		{[]int{0, 1}, 2},
		{[]int{0, 1, 2}, 2}, // Hell is last; beating it unlocks nothing further
	} {
		if got := HighestUnlockedDifficulty(baalDone(c.beaten...)); got != c.want {
			t.Errorf("HighestUnlockedDifficulty(%v) = %d, want %d", c.beaten, got, c.want)
		}
	}
}

// A non-Baal quest must not unlock anything, or clearing Act I Normal would make Hell
// area checks look legitimate.
func TestOnlyBaalUnlocksTheNextDifficulty(t *testing.T) {
	st := &State{CompletedQuests: []Quest{
		{Difficulty: 0, Act: 0, Index: 0, Name: "Den of Evil"},
		{Difficulty: 0, Act: baalAct, Index: 0, Name: "Siege on Harrogath"},
	}}
	if got := HighestUnlockedDifficulty(st); got != 0 {
		t.Errorf("HighestUnlockedDifficulty = %d, want 0", got)
	}
}

// The Baal constants here duplicate the apworld's, because internal/save must not depend
// on the id tables. This pins them together.
func TestBaalMatchesIDContract(t *testing.T) {
	if baalAct != 4 {
		t.Errorf("baalAct = %d, want 4 (Act V)", baalAct)
	}
	if baalQuestIndex != len(QuestNames[baalAct])-1 {
		t.Errorf("baalQuestIndex = %d, want the last quest of Act V", baalQuestIndex)
	}
	if QuestNames[baalAct][baalQuestIndex] != "Eve of Destruction" {
		t.Errorf("quest at the Baal position is %q", QuestNames[baalAct][baalQuestIndex])
	}
}
