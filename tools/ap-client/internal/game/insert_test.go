//go:build windows

package game

import (
	"encoding/binary"
	"testing"

	"github.com/hectorgimenez/d2go/pkg/data/stat"
)

func entries(ids ...stat.ID) []StatEntry {
	out := make([]StatEntry, len(ids))
	for i, id := range ids {
		out[i] = StatEntry{ID: id, Value: uint32(100 + i)}
	}
	return out
}

// A fresh Paladin's base list, measured: 0-3, then 6-12, then 67-69. Skill points (5)
// and stat points (4) go between 3 and 6; the key stat (368) goes on the end.
func TestNewEntriesKeepTheGamesOrder(t *testing.T) {
	list := entries(0, 1, 2, 3, 6, 7, 8, 12, 67, 69)
	cases := []struct {
		id  stat.ID
		pos int
	}{{4, 4}, {5, 4}, {68, 9}, {368, 10}}
	for _, c := range cases {
		pos, block, err := planInsert(list, c.id, 7)
		if err != nil || pos != c.pos {
			t.Fatalf("stat %d: pos %d err %v, want %d", c.id, pos, err, c.pos)
		}
		if len(block) != (len(list)-pos+1)*statEntrySize {
			t.Fatalf("stat %d: block of %d bytes", c.id, len(block))
		}
		if stat.ID(binary.LittleEndian.Uint16(block[statEntryID:])) != c.id || binary.LittleEndian.Uint32(block[statEntryValue:]) != 7 {
			t.Fatalf("stat %d: the new entry is not first in the block", c.id)
		}
		// Everything after it moves up one slot, unchanged.
		for i, e := range list[pos:] {
			off := (i + 1) * statEntrySize
			if stat.ID(binary.LittleEndian.Uint16(block[off+statEntryID:])) != e.ID || binary.LittleEndian.Uint32(block[off+statEntryValue:]) != e.Value {
				t.Fatalf("stat %d: entry %d moved wrongly", c.id, i)
			}
		}
	}
}

func TestAnExistingOrUnorderedListIsRefused(t *testing.T) {
	if _, _, err := planInsert(entries(0, 5, 6), 5, 1); err == nil {
		t.Fatal("a duplicate entry was planned")
	}
	if _, _, err := planInsert(entries(0, 6, 5), 4, 1); err == nil {
		t.Fatal("an unordered list was trusted")
	}
}

func TestTextIsCutAtACharacterBoundary(t *testing.T) {
	if got := string(fitUTF8("You received Ågren's Ring", 15)); got != "You received Å" && len(got) > 15 {
		t.Fatalf("%q", got)
	}
	if got := fitUTF8("abcé", 4); string(got) != "abc" {
		t.Fatalf("split a character: %q", got)
	}
	if got := fitUTF8("short", 600); string(got) != "short" {
		t.Fatalf("%q", got)
	}
}
