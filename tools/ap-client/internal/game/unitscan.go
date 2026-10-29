//go:build windows

package game

import (
	"bytes"
	"encoding/binary"
	"fmt"
	"sort"
	"unsafe"

	"github.com/hectorgimenez/d2go/pkg/data/stat"
	"golang.org/x/sys/windows"
)

// Unit header: type, class and unit id are the first twelve bytes of every unit.
const (
	unitHeaderSize = 12
	unitTypePlayer = 0

	// MEMORY_BASIC_INFORMATION.Type for private (heap) pages.
	memPrivate = 0x20000
)

// UnitCopy is another structure in the process that looks like the same player.
type UnitCopy struct {
	Addr uintptr
	// Level and Stats come from the candidate's own base stat list, which is what makes
	// it a live unit rather than a coincidental byte match.
	Level int
	Stats int
	// SkillPoints is the candidate's unspent count; HasSkillPoints is false when the
	// stat has no entry there.
	SkillPoints    int
	HasSkillPoints bool
}

// unitHeaderMatches returns the offsets in buf, on 8-byte boundaries, where a unit
// header with this class and id begins.
func unitHeaderMatches(buf []byte, class, unitID uint32) []int {
	var key [unitHeaderSize]byte
	binary.LittleEndian.PutUint32(key[0:], unitTypePlayer)
	binary.LittleEndian.PutUint32(key[4:], class)
	binary.LittleEndian.PutUint32(key[8:], unitID)
	var out []int
	for off := 0; off+unitHeaderSize <= len(buf); off += 8 {
		if bytes.Equal(buf[off:off+unitHeaderSize], key[:]) {
			out = append(out, off)
		}
	}
	return out
}

// FindUnitCopies scans the whole process for other structures holding the same player.
//
// D2R single-player runs the game simulation in the same process as the renderer. The
// unit table the client reads is the display side, and the simulation keeps its own
// copy of the character: a value written only to the display copy shows on screen and
// is ignored by the rules (measured, see docs/archipelago/DESIGN_NOTES.md). This lists
// every candidate, for `probe -copies`. It takes minutes; SimulationCopy is the fast
// path. Read-only.
func (c *Client) FindUnitCopies(player uintptr) ([]UnitCopy, error) {
	return c.findUnitCopies(player, false)
}

// SimulationCopy returns the game's own copy of the player, the one its rules read.
//
// On D2R 3.3 it was measured tens to hundreds of kilobytes from the display copy, so
// memory is searched nearest the player first and the search stops at the first region
// that holds a copy. The result is cached for this player unit and re-checked on use.
// Exactly one copy is required: writing to a guess could corrupt the character.
func (c *Client) SimulationCopy(player uintptr) (uintptr, error) {
	if c.simFor == player && c.sim != 0 && c.sameUnit(c.sim, player) {
		return c.sim, nil
	}
	c.simFor, c.sim = 0, 0
	copies, err := c.findUnitCopies(player, true)
	if err != nil {
		return 0, err
	}
	if len(copies) != 1 {
		return 0, fmt.Errorf("found %d copies of the player beside the display copy, expected 1", len(copies))
	}
	c.simFor, c.sim = player, copies[0].Addr
	return c.sim, nil
}

// sameUnit reports whether addr still holds a live copy of the player unit.
func (c *Client) sameUnit(addr, player uintptr) bool {
	a := make([]byte, unitHeaderSize)
	b := make([]byte, unitHeaderSize)
	if c.proc.ReadIntoBuffer(addr, a) != nil || c.proc.ReadIntoBuffer(player, b) != nil || !bytes.Equal(a, b) {
		return false
	}
	_, ok := c.describeUnit(addr)
	return ok
}

type memRegion struct{ base, end uintptr }

// findUnitCopies scans heap memory for other units with the player's header. nearest
// orders the regions by distance from the player and stops after the first region
// that holds a copy whose level matches the player's.
func (c *Client) findUnitCopies(player uintptr, nearest bool) ([]UnitCopy, error) {
	read := c.proc.ReadIntoBuffer
	header := make([]byte, unitHeaderSize)
	if err := read(player, header); err != nil {
		return nil, fmt.Errorf("reading the player unit: %w", err)
	}
	if binary.LittleEndian.Uint32(header) != unitTypePlayer {
		return nil, fmt.Errorf("unit at 0x%x is not a player", player)
	}
	class := binary.LittleEndian.Uint32(header[4:])
	unitID := binary.LittleEndian.Uint32(header[8:])
	self, ok := c.describeUnit(player)
	if !ok {
		return nil, fmt.Errorf("the player unit has no readable base stats")
	}

	h, err := windows.OpenProcess(windows.PROCESS_QUERY_INFORMATION|windows.PROCESS_VM_READ, false, c.proc.GetPID())
	if err != nil {
		return nil, fmt.Errorf("OpenProcess: %w", err)
	}
	defer windows.CloseHandle(h)

	regions := heapRegions(h)
	if nearest {
		// First a window around the player within its own region: a heap region can be
		// hundreds of megabytes, and the copy has always been within a few hundred KB.
		const window = 32 << 20
		var near []memRegion
		for _, r := range regions {
			if player >= r.base && player < r.end {
				lo, hi := r.base, r.end
				if player-lo > window {
					lo = player - window
				}
				if hi-player > window {
					hi = player + window
				}
				near = append(near, memRegion{lo, hi})
			}
		}
		if found := c.scanRegions(h, near, player, class, unitID, self.Level, true); len(found) > 0 {
			return found, nil
		}
	}
	if nearest {
		distance := func(r memRegion) uintptr {
			switch {
			case player < r.base:
				return r.base - player
			case player >= r.end:
				return player - r.end + 1
			}
			return 0
		}
		sort.SliceStable(regions, func(i, j int) bool { return distance(regions[i]) < distance(regions[j]) })
	}

	return c.scanRegions(h, regions, player, class, unitID, self.Level, nearest), nil
}

// scanRegions reads each region looking for unit headers like the player's. With
// stopEarly, only copies at the player's level count, and the scan ends after the first
// region that holds one.
func (c *Client) scanRegions(h windows.Handle, regions []memRegion, player uintptr, class, unitID uint32, level int, stopEarly bool) []UnitCopy {
	const chunk = 4 << 20
	var out []UnitCopy
	buf := make([]byte, chunk+unitHeaderSize)
	for _, r := range regions {
		for base := r.base; base < r.end; base += chunk {
			// Read a header's worth past the chunk so a header on the boundary is not missed.
			n := chunk + unitHeaderSize
			if rest := int(r.end - base); rest < n {
				n = rest
			}
			var got uintptr
			if windows.ReadProcessMemory(h, base, &buf[0], uintptr(n), &got) != nil {
				continue
			}
			for _, off := range unitHeaderMatches(buf[:got], class, unitID) {
				if off >= chunk {
					continue // the next chunk reports it
				}
				candidate := base + uintptr(off)
				if candidate == player {
					continue
				}
				if copy, ok := c.describeUnit(candidate); ok && (!stopEarly || copy.Level == level) {
					out = append(out, copy)
				}
			}
		}
		if stopEarly && len(out) > 0 {
			break
		}
	}
	return out
}

// heapRegions lists committed, private, writable, unguarded memory: where units live.
func heapRegions(h windows.Handle) []memRegion {
	const memLimit = uintptr(0x7FFFFFFF0000)
	var out []memRegion
	var mbi windows.MemoryBasicInformation
	for addr := uintptr(0x10000); addr < memLimit; {
		if err := windows.VirtualQueryEx(h, addr, &mbi, unsafe.Sizeof(mbi)); err != nil {
			break
		}
		next := mbi.BaseAddress + mbi.RegionSize
		if next <= addr {
			break
		}
		writable := mbi.Protect&(windows.PAGE_READWRITE|windows.PAGE_EXECUTE_READWRITE) != 0
		if mbi.State == windows.MEM_COMMIT && mbi.Type == memPrivate && writable && mbi.Protect&windows.PAGE_GUARD == 0 {
			out = append(out, memRegion{mbi.BaseAddress, next})
		}
		addr = next
	}
	return out
}

// describeUnit accepts a candidate only if it carries a plausible base stat list.
func (c *Client) describeUnit(addr uintptr) (UnitCopy, bool) {
	entries, err := readBaseStats(c.proc.ReadIntoBuffer, addr)
	if err != nil {
		return UnitCopy{}, false
	}
	copy := UnitCopy{Addr: addr, Stats: len(entries)}
	for _, e := range entries {
		if e.Layer != 0 {
			continue
		}
		switch e.ID {
		case stat.Level:
			copy.Level = int(e.Value)
		case stat.SkillPoints:
			copy.SkillPoints, copy.HasSkillPoints = int(e.Value), true
		}
	}
	return copy, copy.Level >= 1 && copy.Level <= 99
}
