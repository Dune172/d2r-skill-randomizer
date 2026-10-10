package game

import (
	"bytes"
	"encoding/binary"
	"fmt"
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

// FindUnitCopies scans the process for other structures holding the same player.
//
// D2R single-player runs the game simulation in the same process as the renderer. The
// unit table the client reads is the display side; if the simulation keeps its own copy
// of the character, a value written only to the display copy shows on screen and is
// ignored by the rules. This finds every candidate so a write can be tested against
// each. Read-only.
func (c *Client) FindUnitCopies(player uintptr) ([]UnitCopy, error) {
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

	h, err := windows.OpenProcess(windows.PROCESS_QUERY_INFORMATION|windows.PROCESS_VM_READ, false, c.proc.GetPID())
	if err != nil {
		return nil, fmt.Errorf("OpenProcess: %w", err)
	}
	defer windows.CloseHandle(h)

	const (
		chunk    = 4 << 20
		memLimit = uintptr(0x7FFFFFFF0000)
	)
	var out []UnitCopy
	buf := make([]byte, chunk)
	var mbi windows.MemoryBasicInformation
	for addr := uintptr(0x10000); addr < memLimit; {
		if err := windows.VirtualQueryEx(h, addr, &mbi, unsafe.Sizeof(mbi)); err != nil {
			break
		}
		next := mbi.BaseAddress + mbi.RegionSize
		if next <= addr {
			break
		}
		// Units live on the heap: committed, private, writable, not guarded.
		writable := mbi.Protect&(windows.PAGE_READWRITE|windows.PAGE_EXECUTE_READWRITE) != 0
		if mbi.State == windows.MEM_COMMIT && mbi.Type == memPrivate && writable && mbi.Protect&windows.PAGE_GUARD == 0 {
			for base := mbi.BaseAddress; base < next; base += chunk {
				n := chunk
				if rest := int(next - base); rest < n {
					n = rest
				}
				var got uintptr
				if windows.ReadProcessMemory(h, base, &buf[0], uintptr(n), &got) != nil {
					continue
				}
				for _, off := range unitHeaderMatches(buf[:got], class, unitID) {
					candidate := base + uintptr(off)
					if candidate == player {
						continue
					}
					if copy, ok := c.describeUnit(candidate); ok {
						out = append(out, copy)
					}
				}
			}
		}
		addr = next
	}
	return out, nil
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
