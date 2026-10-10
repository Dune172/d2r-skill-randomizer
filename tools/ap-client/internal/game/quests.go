package game

import (
	"encoding/binary"
	"fmt"
	"sort"
)

// Reading quest completion out of the running game rather than out of the save.
//
// The layout of this block is NOT known, and that is the whole problem. d2go reads a
// byte per quest at act bases {0, 8, 16, 24, 34} — note the last one breaks the stride
// the other four establish, which is either a real quirk or an off-by-one nobody caught.
// The .d2s uses a different shape again: 16 bytes per act, a 16-bit word per quest, bit
// 0 meaning complete.
//
// Guessing wrong here does not fail loudly. It produces a plausible set of completed
// quests that is simply wrong, and sends checks for quests the player has not done —
// which in a multiworld releases somebody else's items early and cannot be taken back.
//
// So nothing is guessed. Several candidate layouts are proposed, and the SAVE FILE is
// used as ground truth to pick the one that reproduces it exactly. Until a layout is
// confirmed, quest checks keep coming from the save alone, exactly as before.

// QuestsPerAct mirrors the game: Act IV has 3, the rest 6.
var questsPerAct = []int{6, 6, 6, 3, 6}

// QuestLayout is one hypothesis about how the quest block is arranged.
type QuestLayout struct {
	Name string
	// ActBase is the offset of each act's block, in bytes.
	ActBase []int
	// First is the index of the first quest within an act's block.
	First int
	// Stride is the distance between consecutive quests, in bytes.
	Stride int
	// Width is how many bytes each quest occupies (1 or 2).
	Width int
}

// questLayouts are the hypotheses worth testing, most plausible first.
//
// All of them read bit 0 as "completed", which is the one part the .d2s and every
// published description agree on.
var questLayouts = []QuestLayout{
	{
		// The .d2s shape exactly: 16 bytes per act, a word per quest after an intro
		// word. If the in-memory block mirrors the save, this is it.
		Name: "save-shaped words", ActBase: []int{0, 16, 32, 48, 64}, First: 1, Stride: 2, Width: 2,
	},
	{
		// What d2go does. The 34 is not a typo on our part — upstream really does break
		// the stride for Act V.
		Name: "d2go bytes", ActBase: []int{0, 8, 16, 24, 34}, First: 0, Stride: 1, Width: 1,
	},
	{
		Name: "packed bytes", ActBase: []int{0, 8, 16, 24, 32}, First: 0, Stride: 1, Width: 1,
	},
	{
		// Byte-per-quest but with an intro byte, mirroring the save's framing.
		Name: "bytes after intro", ActBase: []int{0, 8, 16, 24, 32}, First: 1, Stride: 1, Width: 1,
	},
}

// QuestID identifies a quest within a difficulty.
type QuestID struct {
	Act   int
	Index int
}

// QuestBlockSize is how much of the quest region to read.
const QuestBlockSize = 96

// QuestBytes returns the current game's raw quest block.
//
// This is the CURRENT DIFFICULTY only — unlike the save, which stores all three — so it
// carries no difficulty of its own and must be paired with one from elsewhere.
func (c *Client) QuestBytes() []byte {
	base := c.gr.ModuleBase() + c.gr.Offsets().Quests
	return c.proc.ReadBytesFromMemory(base, QuestBlockSize)
}

// completedUnder reads the block under one layout hypothesis.
func completedUnder(block []byte, l QuestLayout) (map[QuestID]bool, bool) {
	out := map[QuestID]bool{}
	for act, n := range questsPerAct {
		for i := 0; i < n; i++ {
			off := l.ActBase[act] + (l.First+i)*l.Stride
			if off+l.Width > len(block) {
				return nil, false // the hypothesis does not fit the block we read
			}
			var v uint16
			if l.Width == 2 {
				v = binary.LittleEndian.Uint16(block[off : off+2])
			} else {
				v = uint16(block[off])
			}
			if v&1 == 1 {
				out[QuestID{Act: act, Index: i}] = true
			}
		}
	}
	return out, true
}

// CalibrateQuestLayout picks the layout that reproduces the save exactly.
//
// `saveCompleted` must be the save's completed set FOR THE DIFFICULTY CURRENTLY BEING
// PLAYED, read at a moment when the save is up to date. Ambiguity is treated as failure:
// if several layouts agree, or none does, no layout is returned and quest checks stay on
// the save path. A wrong layout sends checks for quests the player never did.
//
// Requires at least one completed quest — with none, every layout trivially matches and
// nothing has been proven.
func CalibrateQuestLayout(block []byte, saveCompleted map[QuestID]bool) (QuestLayout, bool) {
	if len(saveCompleted) == 0 {
		return QuestLayout{}, false
	}

	var winners []QuestLayout
	for _, l := range questLayouts {
		got, ok := completedUnder(block, l)
		if !ok || len(got) != len(saveCompleted) {
			continue
		}
		match := true
		for q := range saveCompleted {
			if !got[q] {
				match = false
				break
			}
		}
		if match {
			winners = append(winners, l)
		}
	}
	if len(winners) != 1 {
		return QuestLayout{}, false
	}
	return winners[0], true
}

// CompletedQuests reads the block under a CONFIRMED layout.
func CompletedQuests(block []byte, l QuestLayout) []QuestID {
	got, ok := completedUnder(block, l)
	if !ok {
		return nil
	}
	out := make([]QuestID, 0, len(got))
	for q := range got {
		out = append(out, q)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Act != out[j].Act {
			return out[i].Act < out[j].Act
		}
		return out[i].Index < out[j].Index
	})
	return out
}

// DescribeQuestLayouts reports what each hypothesis makes of the block, for diagnosis.
func DescribeQuestLayouts(block []byte, saveCompleted map[QuestID]bool) string {
	s := fmt.Sprintf("save says %d quest(s) complete on this difficulty\n", len(saveCompleted))
	for _, l := range questLayouts {
		got, ok := completedUnder(block, l)
		if !ok {
			s += fmt.Sprintf("  %-20s does not fit the block\n", l.Name)
			continue
		}
		exact := len(got) == len(saveCompleted)
		if exact {
			for q := range saveCompleted {
				if !got[q] {
					exact = false
					break
				}
			}
		}
		verdict := "differs"
		if exact {
			verdict = "MATCHES the save"
		}
		s += fmt.Sprintf("  %-20s %2d complete  %s\n", l.Name, len(got), verdict)
	}
	return s
}
