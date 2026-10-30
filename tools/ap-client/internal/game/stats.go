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
	// statBaseList is the BASE stat list within it. Character level and the point pools
	// live here; the other list (+0xA8) was measured EMPTY on a live character.
	statBaseList = 0x30

	statListCount  = 0x08
	statEntrySize  = 8
	statEntryID    = 0x02 // u16
	statEntryValue = 0x04 // u32
)

// StatEntry is one record of a unit's base stat list.
type StatEntry struct {
	Addr  uintptr
	Layer uint16
	ID    stat.ID
	Value uint32
}

// readBaseStats reads every entry of a unit's base stat list.
//
// The list is SPARSE: a stat the unit has never held simply has no entry, which is why
// "the stat is zero" and "there is nothing to write to" have to be told apart.
func readBaseStats(read memoryRead, unit uintptr) ([]StatEntry, error) {
	container, e := readUint(read, unit+offStatsListEx, 8)
	if e != nil {
		return nil, e
	}
	array, e := readUint(read, uintptr(container)+statBaseList, 8)
	if e != nil {
		return nil, e
	}
	count, e := readUint(read, uintptr(container)+statBaseList+statListCount, 8)
	if e != nil {
		return nil, e
	}
	if array < 0x10000 || count == 0 || count > 1024 {
		return nil, fmt.Errorf("base stat list is unavailable")
	}
	b := make([]byte, int(count)*statEntrySize)
	if e = read(uintptr(array), b); e != nil {
		return nil, e
	}
	out := make([]StatEntry, 0, count)
	for i := 0; i < int(count); i++ {
		off := i * statEntrySize
		out = append(out, StatEntry{
			Addr:  uintptr(array) + uintptr(off),
			Layer: binary.LittleEndian.Uint16(b[off:]),
			ID:    stat.ID(binary.LittleEndian.Uint16(b[off+statEntryID:])),
			Value: binary.LittleEndian.Uint32(b[off+statEntryValue:]),
		})
	}
	return out, nil
}

// readBaseStat finds one layer-0 stat. A duplicated entry is an error rather than a
// choice: writing either one would be a guess.
func readBaseStat(read memoryRead, unit uintptr, id stat.ID) (uintptr, uint32, bool, error) {
	entries, e := readBaseStats(read, unit)
	if e != nil {
		return 0, 0, false, e
	}
	var addr uintptr
	var val uint32
	for _, entry := range entries {
		if entry.ID == id && entry.Layer == 0 {
			if addr != 0 {
				return 0, 0, false, fmt.Errorf("duplicate base stat %d", id)
			}
			addr, val = entry.Addr, entry.Value
		}
	}
	return addr, val, addr != 0, nil
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
// one unit. Grants go through SetPlayerStat instead.
//
// Reports exists=false, with no error, when the stat has no entry: that is "not yet",
// not a failure. The client never adds entries; it only changes the value of one.
func (c *Client) SetBaseStat(unit uintptr, id stat.ID, value uint32) (exists bool, err error) {
	read := c.proc.ReadIntoBuffer
	addr, cur, ok, err := readBaseStat(read, unit, id)
	if err != nil {
		return false, err
	}
	if !ok {
		return false, nil
	}
	if cur == value {
		return true, nil
	}

	h, err := c.openWrite()
	if err != nil {
		return true, err
	}
	defer windows.CloseHandle(h)

	// The sparse stat array can move during allocation or respec. Re-resolve before
	// writing, and leave a changed snapshot to the next poll.
	again, now, still, err := readBaseStat(read, unit, id)
	if err != nil || !still || again != addr || now != cur {
		return false, fmt.Errorf("stat %d changed while it was being written; retrying", id)
	}
	var b [4]byte
	binary.LittleEndian.PutUint32(b[:], value)
	if err := windows.WriteProcessMemory(h, addr+statEntryValue, &b[0], 4, nil); err != nil {
		return true, fmt.Errorf("writing stat %d: %w", id, err)
	}
	return true, nil
}
