//go:build windows

package game

import (
	"encoding/binary"
	"testing"
)

// The danger with the quest block is not that reading it fails — it is that reading it
// under the WRONG layout succeeds and produces a plausible, wrong set of completed
// quests. In a multiworld that releases other players' items early, and a sent check
// cannot be taken back. So every test here is about refusing to commit to a layout that
// has not been proven against the save.

// build renders a completed set into a block under the given layout, so a hypothesis can
// be tested against data it was not written from.
func build(l QuestLayout, completed []QuestID) []byte {
	block := make([]byte, QuestBlockSize)
	for _, q := range completed {
		off := l.ActBase[q.Act] + (l.First+q.Index)*l.Stride
		if l.Width == 2 {
			binary.LittleEndian.PutUint16(block[off:off+2], 1)
		} else {
			block[off] = 1
		}
	}
	return block
}

func set(qs ...QuestID) map[QuestID]bool {
	m := map[QuestID]bool{}
	for _, q := range qs {
		m[q] = true
	}
	return m
}

func TestCalibrationFindsTheLayoutThatWroteTheBlock(t *testing.T) {
	completed := []QuestID{{0, 0}, {0, 5}, {1, 2}, {4, 1}}
	for _, want := range questLayouts {
		block := build(want, completed)
		got, ok := CalibrateQuestLayout(block, set(completed...))
		if !ok {
			// Layouts can be indistinguishable on a given set; that is handled by the
			// ambiguity test below. Here we only require it never picks a WRONG one.
			continue
		}
		round, _ := completedUnder(block, got)
		for _, q := range completed {
			if !round[q] {
				t.Errorf("layout %q picked %q, which does not reproduce the block",
					want.Name, got.Name)
				break
			}
		}
	}
}

// With nothing completed, every layout reproduces the empty set. Calibrating there would
// lock in whichever hypothesis happened to be first.
func TestNoCompletedQuestsMeansNoCalibration(t *testing.T) {
	block := make([]byte, QuestBlockSize)
	if _, ok := CalibrateQuestLayout(block, set()); ok {
		t.Error("calibrated against an empty save; every layout matches nothing")
	}
}

// If two hypotheses both reproduce the save, neither has been proven.
func TestAmbiguityIsRefused(t *testing.T) {
	// Act I quest 0 sits at byte 0 under both "d2go bytes" and "packed bytes", which
	// are identical for acts I-IV, so this set cannot separate them.
	block := build(questLayouts[1], []QuestID{{0, 0}})
	if l, ok := CalibrateQuestLayout(block, set(QuestID{0, 0})); ok {
		t.Errorf("committed to %q on evidence that cannot distinguish layouts", l.Name)
	}
}

// A save the block does not reproduce means the block is not what we think it is.
func TestDisagreementYieldsNoLayout(t *testing.T) {
	block := make([]byte, QuestBlockSize) // nothing set
	if _, ok := CalibrateQuestLayout(block, set(QuestID{0, 0}, QuestID{2, 3})); ok {
		t.Error("calibrated despite the block showing none of the save's quests")
	}
}

// Extra completions in memory are the POINT — that is a quest finished since the last
// save write. They must not prevent calibration from being trusted afterwards, but they
// must not be present AT calibration time either, or the match is not exact.
func TestExtraCompletionsInMemoryBreakAnExactMatch(t *testing.T) {
	l := questLayouts[0]
	block := build(l, []QuestID{{0, 0}, {0, 1}, {1, 1}})
	if _, ok := CalibrateQuestLayout(block, set(QuestID{0, 0}, QuestID{0, 1})); ok {
		t.Error("calibrated on a block that has more completions than the save")
	}
}

func TestLayoutsStayInsideTheBlock(t *testing.T) {
	block := make([]byte, QuestBlockSize)
	for _, l := range questLayouts {
		if _, ok := completedUnder(block, l); !ok {
			t.Errorf("layout %q reads past the %d-byte block", l.Name, QuestBlockSize)
		}
	}
}

func TestCompletedQuestsIsOrdered(t *testing.T) {
	l := questLayouts[0]
	block := build(l, []QuestID{{4, 2}, {0, 1}, {2, 0}})
	got := CompletedQuests(block, l)
	if len(got) != 3 {
		t.Fatalf("got %d quests, want 3", len(got))
	}
	for i := 1; i < len(got); i++ {
		a, b := got[i-1], got[i]
		if a.Act > b.Act || (a.Act == b.Act && a.Index >= b.Index) {
			t.Errorf("not ordered: %+v before %+v", a, b)
		}
	}
}

// Act IV has 3 quests, not 6. A layout that assumed 6 everywhere would read Act V's
// first quests as Act IV's last and shift everything after it.
func TestActFourHasThreeQuests(t *testing.T) {
	if questsPerAct[3] != 3 {
		t.Errorf("questsPerAct[3] = %d, want 3", questsPerAct[3])
	}
	total := 0
	for _, n := range questsPerAct {
		total += n
	}
	if total != 27 {
		t.Errorf("quests per difficulty = %d, want 27", total)
	}
}
