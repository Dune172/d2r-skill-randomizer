//go:build windows

package game

import (
	"encoding/binary"
	"fmt"

	"github.com/hectorgimenez/d2go/pkg/data/stat"
	"golang.org/x/sys/windows"
)

// Stat container layout on a unit.
const (
	// offStatsListEx is the unit's stat container.
	offStatsListEx = 0x88
	// statBaseList is the BASE stat list within it: what the character has on its own.
	// Character level and the point pools live here.
	statBaseList = 0x30
	// statFullList is the COMBINED list: the base stats plus everything items and states
	// add (measured on D2R 3.3: equipment damage and defence appear here and not in the
	// base list). Some rules read this one: spending a stat point checks it, so a stat
	// point that is only in the base list shows a "+" that does nothing.
	statFullList = 0xE8

	statListCount  = 0x08
	statEntrySize  = 8
	statEntryID    = 0x02 // u16
	statEntryValue = 0x04 // u32
)

// StatEntry is one record of a unit's stat list.
type StatEntry struct {
	Addr  uintptr
	Layer uint16
	ID    stat.ID
	Value uint32
}

// readStatList reads every entry of one of a unit's stat lists.
//
// The lists are SPARSE: a stat the unit has never held simply has no entry, which is why
// "the stat is zero" and "there is no entry yet" have to be told apart.
func readStatList(read memoryRead, unit, list uintptr) ([]StatEntry, error) {
	h, err := readStatListHeader(read, unit, list)
	if err != nil {
		return nil, err
	}
	b := make([]byte, int(h.Count)*statEntrySize)
	if err := read(h.Array, b); err != nil {
		return nil, err
	}
	out := make([]StatEntry, 0, h.Count)
	for i := 0; i < int(h.Count); i++ {
		off := i * statEntrySize
		out = append(out, StatEntry{
			Addr:  h.Array + uintptr(off),
			Layer: binary.LittleEndian.Uint16(b[off:]),
			ID:    stat.ID(binary.LittleEndian.Uint16(b[off+statEntryID:])),
			Value: binary.LittleEndian.Uint32(b[off+statEntryValue:]),
		})
	}
	return out, nil
}

// readBaseStats reads every entry of a unit's base stat list.
func readBaseStats(read memoryRead, unit uintptr) ([]StatEntry, error) {
	return readStatList(read, unit, statBaseList)
}

// findStat finds one layer-0 stat. A duplicated entry is an error rather than a choice:
// writing either one would be a guess.
func findStat(entries []StatEntry, id stat.ID) (StatEntry, bool, error) {
	var found StatEntry
	ok := false
	for _, e := range entries {
		if e.ID == id && e.Layer == 0 {
			if ok {
				return StatEntry{}, false, fmt.Errorf("duplicate stat %d", id)
			}
			found, ok = e, true
		}
	}
	return found, ok, nil
}

// readBaseStat finds one layer-0 base stat.
func readBaseStat(read memoryRead, unit uintptr, id stat.ID) (uintptr, uint32, bool, error) {
	entries, e := readBaseStats(read, unit)
	if e != nil {
		return 0, 0, false, e
	}
	s, ok, e := findStat(entries, id)
	return s.Addr, s.Value, ok, e
}

// BaseStats lists a unit's base stat entries.
func (c *Client) BaseStats(unit uintptr) ([]StatEntry, error) {
	return readBaseStats(c.proc.ReadIntoBuffer, unit)
}

// BaseStat reads one base stat and reports whether it has an entry at all.
func (c *Client) BaseStat(unit uintptr, id stat.ID) (uint32, bool, error) {
	_, v, ok, err := readBaseStat(c.proc.ReadIntoBuffer, unit, id)
	return v, ok, err
}

// SetPlayerStat writes a player stat the way the game will honour it: to the game's own
// copy of the character (SimulationCopy) and then to the display copy, so the rules and
// the screen agree. Written to the display copy alone, a value is shown and spendable on
// screen but the game does not act on it (measured on D2R 3.3).
//
// exists reports whether the game's copy has the entry; that is the one that counts.
// Use GivePlayerStat to create a missing one.
func (c *Client) SetPlayerStat(player uintptr, id stat.ID, value uint32) (exists bool, err error) {
	sim, err := c.SimulationCopy(player)
	if err != nil {
		return false, fmt.Errorf("finding the game's copy of the character: %w", err)
	}
	exists, err = c.SetBaseStat(sim, id, value)
	if err != nil || !exists {
		return exists, err
	}
	if _, err := c.SetBaseStat(player, id, value); err != nil {
		return true, fmt.Errorf("display copy: %w", err)
	}
	return true, nil
}

// SetBaseStat overwrites the value of a base stat entry the game already created, on
// one unit, and sets the combined list's entry to the same value. Grants go through
// SetPlayerStat instead.
//
// The combined value is set equal, not moved by the difference: every stat the client
// grants (points, keys, gold, current life, mana and stamina) is one no item adds to,
// and an exact value cannot drift however often a write is retried.
//
// Reports exists=false, with no error, when the base list has no entry.
func (c *Client) SetBaseStat(unit uintptr, id stat.ID, value uint32) (exists bool, err error) {
	read := c.proc.ReadIntoBuffer
	base, err := readStatList(read, unit, statBaseList)
	if err != nil {
		return false, err
	}
	cur, ok, err := findStat(base, id)
	if err != nil || !ok {
		return false, err
	}
	full, err := readStatList(read, unit, statFullList)
	if err != nil {
		return true, fmt.Errorf("combined stat list: %w", err)
	}
	fullCur, inFull, err := findStat(full, id)
	if err != nil {
		return true, err
	}
	fullWant := value
	if cur.Value == value && inFull && fullCur.Value == fullWant {
		return true, nil
	}

	h, err := c.openWrite()
	if err != nil {
		return true, err
	}
	defer windows.CloseHandle(h)

	// The sparse stat array can move during allocation or respec. Re-resolve before
	// writing, and leave a changed snapshot to the next poll.
	again, err := readStatList(read, unit, statBaseList)
	if err != nil {
		return true, err
	}
	now, still, err := findStat(again, id)
	if err != nil || !still || now != cur {
		return true, fmt.Errorf("stat %d changed while it was being written; retrying", id)
	}
	if err := writeU32(h, cur.Addr+statEntryValue, value); err != nil {
		return true, fmt.Errorf("writing stat %d: %w", id, err)
	}
	if !inFull {
		// A stat the game has not combined yet (one this client added before it learned
		// about the combined list, say): add it there too.
		if err := c.insertStat(unit, statFullList, id, fullWant); err != nil {
			return true, fmt.Errorf("adding stat %d to the combined list: %w", id, err)
		}
		return true, nil
	}
	fullNow, err := readStatList(read, unit, statFullList)
	if err != nil {
		return true, err
	}
	if f, ok, _ := findStat(fullNow, id); !ok || f != fullCur {
		return true, fmt.Errorf("stat %d changed while it was being written; retrying", id)
	}
	if err := writeU32(h, fullCur.Addr+statEntryValue, fullWant); err != nil {
		return true, fmt.Errorf("writing combined stat %d: %w", id, err)
	}
	return true, nil
}

func writeU32(h windows.Handle, addr uintptr, v uint32) error {
	var b [4]byte
	binary.LittleEndian.PutUint32(b[:], v)
	return windows.WriteProcessMemory(h, addr, &b[0], 4, nil)
}
