//go:build windows

package game

import (
	"encoding/binary"
	"errors"
	"fmt"

	"github.com/hectorgimenez/d2go/pkg/data/stat"
	"golang.org/x/sys/windows"
)

// statListCapacity is the slot count the game allocated for a stat list (u64), right
// after the entry count.
const statListCapacity = 0x10

// ErrNoRoom: the game's stat array is full, so an entry cannot be added without the
// game's own allocator. The game grows the array when it next adds a stat of its own
// (a level-up, a quest reward, an item), and the caller tries again then.
var ErrNoRoom = errors.New("the stat list has no free slot")

// StatListHeader is one of a unit's stat lists: where its entries are, how many there
// are and how many fit.
type StatListHeader struct {
	List     uintptr // the header itself
	Array    uintptr
	Count    uint64
	Capacity uint64
}

func readStatListHeader(read memoryRead, unit, list uintptr) (StatListHeader, error) {
	container, err := readUint(read, unit+offStatsListEx, 8)
	if err != nil {
		return StatListHeader{}, err
	}
	at := uintptr(container) + list
	b := make([]byte, 0x18)
	if err := read(at, b); err != nil {
		return StatListHeader{}, err
	}
	h := StatListHeader{
		List:     at,
		Array:    uintptr(binary.LittleEndian.Uint64(b[0:])),
		Count:    binary.LittleEndian.Uint64(b[statListCount:]),
		Capacity: binary.LittleEndian.Uint64(b[statListCapacity:]),
	}
	if h.Array < 0x10000 || h.Count == 0 || h.Count > 1024 || h.Capacity < h.Count || h.Capacity > 1024 {
		return h, fmt.Errorf("stat list is unavailable (count %d, capacity %d)", h.Count, h.Capacity)
	}
	return h, nil
}

// BaseStatList reads a unit's base stat list header.
func (c *Client) BaseStatList(unit uintptr) (StatListHeader, error) {
	return readStatListHeader(c.proc.ReadIntoBuffer, unit, statBaseList)
}

// statKey is how the game orders a stat list: stat id, then layer.
func statKey(layer uint16, id stat.ID) uint32 { return uint32(id)<<16 | uint32(layer) }

// planInsert works out where a layer-0 entry goes in a sorted list, and the bytes to
// write from that slot to the end: the new entry, then the entries it moves along.
func planInsert(entries []StatEntry, id stat.ID, value uint32) (pos int, block []byte, err error) {
	key := statKey(0, id)
	pos = len(entries)
	for i, e := range entries {
		k := statKey(e.Layer, e.ID)
		if i > 0 && k <= statKey(entries[i-1].Layer, entries[i-1].ID) {
			return 0, nil, fmt.Errorf("stat list is not in order")
		}
		if k == key {
			return 0, nil, fmt.Errorf("stat %d already has an entry", id)
		}
		if k > key && pos == len(entries) {
			pos = i
		}
	}
	block = make([]byte, (len(entries)-pos+1)*statEntrySize)
	binary.LittleEndian.PutUint16(block[statEntryID:], uint16(id))
	binary.LittleEndian.PutUint32(block[statEntryValue:], value)
	for i, e := range entries[pos:] {
		off := (i + 1) * statEntrySize
		binary.LittleEndian.PutUint16(block[off:], e.Layer)
		binary.LittleEndian.PutUint16(block[off+statEntryID:], uint16(e.ID))
		binary.LittleEndian.PutUint32(block[off+statEntryValue:], e.Value)
	}
	return pos, block, nil
}

// insertStat adds a layer-0 entry to one of a unit's stat lists, in the free space the
// game already allocated. It never allocates: a full list is ErrNoRoom.
//
// The entries after the new one move up a slot first and the count goes up last, so a
// reader in between sees the old list minus at most its final entry, never garbage.
func (c *Client) insertStat(unit, list uintptr, id stat.ID, value uint32) error {
	read := c.proc.ReadIntoBuffer
	h, err := readStatListHeader(read, unit, list)
	if err != nil {
		return err
	}
	if h.Count >= h.Capacity {
		return ErrNoRoom
	}
	entries, err := readStatList(read, unit, list)
	if err != nil {
		return err
	}
	pos, block, err := planInsert(entries, id, value)
	if err != nil {
		return err
	}

	wh, err := c.openWrite()
	if err != nil {
		return err
	}
	defer windows.CloseHandle(wh)

	// The game may have changed the list since: start again next poll if so.
	again, err := readStatListHeader(read, unit, list)
	if err != nil || again != h {
		return fmt.Errorf("stat list changed while adding stat %d; retrying", id)
	}
	at := h.Array + uintptr(pos*statEntrySize)
	if err := windows.WriteProcessMemory(wh, at, &block[0], uintptr(len(block)), nil); err != nil {
		return fmt.Errorf("adding stat %d: %w", id, err)
	}
	var n [8]byte
	binary.LittleEndian.PutUint64(n[:], h.Count+1)
	if err := windows.WriteProcessMemory(wh, h.List+statListCount, &n[0], 8, nil); err != nil {
		return fmt.Errorf("adding stat %d (count): %w", id, err)
	}
	return nil
}

// GivePlayerStat sets a player stat, creating its entry if the character has none: on
// the game's own copy and then the display copy, in the base list and the combined one,
// the way the game itself holds a stat it granted. This is what replaces the potions
// that once had to create the point pools.
//
// Every list that needs a new entry is checked for room first, and nothing is written
// unless all of them have it, so a full list never leaves a stat half made. spare is how
// many free slots to leave in each list afterwards: a grant that matters less (gold)
// holds back so it never takes the last slot from the point pools. ErrNoRoom means a
// list is too full; nothing was changed and the caller tries again later.
//
// A copy that already has the entry is written instead, so a half-finished earlier
// attempt completes, and every value written is exact, so retries cannot add up.
func (c *Client) GivePlayerStat(player uintptr, id stat.ID, value uint32, spare int) error {
	sim, err := c.SimulationCopy(player)
	if err != nil {
		return fmt.Errorf("finding the game's copy of the character: %w", err)
	}
	read := c.proc.ReadIntoBuffer
	units := []uintptr{sim, player}
	for _, unit := range units {
		for _, list := range []uintptr{statBaseList, statFullList} {
			entries, err := readStatList(read, unit, list)
			if err != nil {
				return err
			}
			if _, ok, err := findStat(entries, id); err != nil {
				return err
			} else if ok {
				continue
			}
			h, err := readStatListHeader(read, unit, list)
			if err != nil {
				return err
			}
			if h.Count+1+uint64(max(spare, 0)) > h.Capacity {
				return ErrNoRoom
			}
		}
	}
	for _, unit := range units {
		exists, err := c.SetBaseStat(unit, id, value)
		if err != nil {
			return err
		}
		if exists {
			continue
		}
		// Combined list first: an entry there alone changes nothing the player sees.
		full, err := readStatList(read, unit, statFullList)
		if err != nil {
			return fmt.Errorf("combined stat list: %w", err)
		}
		if f, ok, err := findStat(full, id); err != nil {
			return err
		} else if ok {
			if _, err := c.setListValue(unit, statFullList, f, value); err != nil {
				return err
			}
		} else if err := c.insertStat(unit, statFullList, id, value); err != nil {
			return err
		}
		if err := c.insertStat(unit, statBaseList, id, value); err != nil {
			return err
		}
	}
	return nil
}

// setListValue writes one entry's value after checking it is unchanged.
func (c *Client) setListValue(unit, list uintptr, was StatEntry, value uint32) (bool, error) {
	entries, err := readStatList(c.proc.ReadIntoBuffer, unit, list)
	if err != nil {
		return false, err
	}
	now, ok, err := findStat(entries, was.ID)
	if err != nil || !ok || now != was {
		return false, fmt.Errorf("stat %d changed while it was being written; retrying", was.ID)
	}
	h, err := c.openWrite()
	if err != nil {
		return false, err
	}
	defer windows.CloseHandle(h)
	return true, writeU32(h, was.Addr+statEntryValue, value)
}
