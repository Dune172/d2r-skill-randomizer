// Package save reads Archipelago location checks out of a D2R .d2s character file.
//
// READ-ONLY BY DESIGN. Stage 0 established that D2R only accepts an externally edited
// save when the game is fully closed — not mid-game, not even at character select — so
// the save can never deliver an item. It is purely a source of checks; grants go
// through memory (see internal/game).
//
// OFFSETS ARE D2R'S, NOT CLASSIC D2'S. Every published .d2s layout describes classic
// Diablo II, whose section markers sit 68 bytes earlier. Using those against D2R reads
// plausible-looking garbage. The values here were measured against real D2R saves
// (version 105) and are asserted by the tests:
//
//	marker   classic   D2R
//	"Woo!"   335       403     quest section
//	"WS"     633       701     waypoint section
//	"gf"     765       833     stats section (variable length after)
package save

import (
	"encoding/binary"
	"errors"
	"fmt"
	"os"
)

const (
	magic = 0xaa55aa55

	questMarkerOffset = 403 // "Woo!"
	questDataStart    = 413 // marker (4) + 6-byte header
	questBlockSize    = 96  // one per difficulty

	waypointMarkerOffset = 701 // "WS"
	waypointDataStart    = 709 // marker (2) + 6-byte header
	waypointBlockSize    = 24
	waypointBitsOffset   = 2 // each block opens with 02 01, then the bitfield
	waypointCount        = 39

	nameOffset = 0x12B // D2R character name; classic D2 puts it at 0x14

	Difficulties = 3
)

// Quest word layout within a 96-byte difficulty block.
//
// Each act is [intro word][quest words...][complete word]. Only the quest words matter
// for checks; bit 0 of a quest word means completed. Act IV has 3 quests, the rest 6 —
// 27 per difficulty, 81 across the three.
var questWordOffsets = [][]int{
	{2, 4, 6, 8, 10, 12},     // Act I
	{18, 20, 22, 24, 26, 28}, // Act II
	{34, 36, 38, 40, 42, 44}, // Act III
	{50, 52, 54},             // Act IV
	{66, 68, 70, 72, 74, 76}, // Act V
}

// QuestNames is indexed [act][questIndex], matching questWordOffsets.
var QuestNames = [][]string{
	{"Den of Evil", "Sisters' Burial Grounds", "Tools of the Trade", "The Search for Cain", "The Forgotten Tower", "Sisters to the Slaughter"},
	{"Radament's Lair", "The Horadric Staff", "Tainted Sun", "Arcane Sanctuary", "The Summoner", "The Seven Tombs"},
	{"Lam Esen's Tome", "Khalim's Will", "Blade of the Old Religion", "The Golden Bird", "The Blackened Temple", "The Guardian"},
	{"The Fallen Angel", "Terror's End", "Hell's Forge"},
	{"Siege on Harrogath", "Rescue on Mount Arreat", "Prison of Ice", "Betrayal of Harrogath", "Rite of Passage", "Eve of Destruction"},
}

var DifficultyNames = [Difficulties]string{"normal", "nightmare", "hell"}

// Quest identifies one quest in one difficulty.
type Quest struct {
	Difficulty int // 0 normal, 1 nightmare, 2 hell
	Act        int // 0-4
	Index      int // index within the act
	Name       string
}

// ID is the stable identity used for Archipelago location names. Deliberately derived
// from position rather than the display name, so renaming a quest cannot silently
// re-key an in-flight multiworld.
func (q Quest) ID() string {
	return fmt.Sprintf("q:%d:%d:%d", q.Difficulty, q.Act, q.Index)
}

// Waypoint identifies one waypoint in one difficulty.
type Waypoint struct {
	Difficulty int
	Index      int // 0-38, game waypoint order
}

func (w Waypoint) ID() string {
	return fmt.Sprintf("wp:%d:%d", w.Difficulty, w.Index)
}

// State is everything the client reads from a save.
type State struct {
	Name            string
	CompletedQuests []Quest
	ActiveWaypoints []Waypoint
}

// Parse reads a .d2s. It never writes.
func Parse(data []byte) (*State, error) {
	if len(data) < waypointDataStart+Difficulties*waypointBlockSize {
		return nil, fmt.Errorf("file too short (%d bytes) to be a D2R save", len(data))
	}
	if binary.LittleEndian.Uint32(data[0:4]) != magic {
		return nil, errors.New("not a .d2s file (bad magic)")
	}
	// Fail loudly if the section markers moved: a silent offset shift would produce
	// plausible-looking but wrong checks, which is worse than not running.
	if string(data[questMarkerOffset:questMarkerOffset+4]) != "Woo!" {
		return nil, fmt.Errorf("quest marker not at %d — D2R save layout changed", questMarkerOffset)
	}
	if string(data[waypointMarkerOffset:waypointMarkerOffset+2]) != "WS" {
		return nil, fmt.Errorf("waypoint marker not at %d — D2R save layout changed", waypointMarkerOffset)
	}

	s := &State{Name: readName(data)}

	for d := 0; d < Difficulties; d++ {
		base := questDataStart + d*questBlockSize
		for act, offsets := range questWordOffsets {
			for i, off := range offsets {
				word := binary.LittleEndian.Uint16(data[base+off : base+off+2])
				if word&1 == 1 { // bit 0 = completed
					s.CompletedQuests = append(s.CompletedQuests, Quest{
						Difficulty: d, Act: act, Index: i, Name: QuestNames[act][i],
					})
				}
			}
		}

		wpBase := waypointDataStart + d*waypointBlockSize + waypointBitsOffset
		for i := 0; i < waypointCount; i++ {
			if data[wpBase+i/8]&(1<<(i%8)) != 0 {
				s.ActiveWaypoints = append(s.ActiveWaypoints, Waypoint{Difficulty: d, Index: i})
			}
		}
	}

	return s, nil
}

// ParseFile reads and parses a save from disk.
func ParseFile(path string) (*State, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	st, err := Parse(data)
	if err != nil {
		return nil, fmt.Errorf("%s: %w", path, err)
	}
	return st, nil
}

// CheckIDs returns every location this save proves is checked, as stable ids.
func (s *State) CheckIDs() []string {
	ids := make([]string, 0, len(s.CompletedQuests)+len(s.ActiveWaypoints))
	for _, q := range s.CompletedQuests {
		ids = append(ids, q.ID())
	}
	for _, w := range s.ActiveWaypoints {
		ids = append(ids, w.ID())
	}
	return ids
}

// readName pulls the character name from the header.
//
// At 0x12B, NOT the classic-D2 0x14 — measured against real D2R saves, where 0x14 holds
// zeros. Same trap as the section markers: the published classic layout silently yields
// an empty string here rather than an error.
func readName(data []byte) string {
	const off, max = nameOffset, 16
	if len(data) < off+max {
		return ""
	}
	b := data[off : off+max]
	for i, c := range b {
		if c == 0 {
			return string(b[:i])
		}
	}
	return string(b)
}
