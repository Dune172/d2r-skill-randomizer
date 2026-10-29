package game

import (
	"bytes"
	"encoding/binary"
	"fmt"
)

type memoryRead func(uintptr, []byte) error

func readUint(read memoryRead, addr uintptr, size int) (uint64, error) {
	if addr < 0x10000 {
		return 0, fmt.Errorf("invalid memory pointer 0x%x", addr)
	}
	b := make([]byte, size)
	if e := read(addr, b); e != nil {
		return 0, e
	}
	switch size {
	case 2:
		return uint64(binary.LittleEndian.Uint16(b)), nil
	case 4:
		return uint64(binary.LittleEndian.Uint32(b)), nil
	case 8:
		return binary.LittleEndian.Uint64(b), nil
	}
	return 0, fmt.Errorf("invalid read width")
}
func readSkills(read memoryRead, player uintptr) ([]SkillNode, error) {
	container, e := readUint(read, player+offSkillList, 8)
	if e != nil {
		return nil, e
	}
	head, e := readUint(read, uintptr(container), 8)
	if e != nil {
		return nil, e
	}
	if head == 0 {
		return nil, fmt.Errorf("skill list is empty or loading")
	}
	nodes := []SkillNode{}
	seen := map[uintptr]bool{}
	for node := uintptr(head); node != 0; {
		if seen[node] || len(nodes) >= 512 {
			return nil, fmt.Errorf("skill list is cyclic or exceeds its bound")
		}
		seen[node] = true
		raw := make([]byte, nodeSize)
		if e = read(node, raw); e != nil {
			return nil, e
		}
		txt := uintptr(binary.LittleEndian.Uint64(raw))
		id, e := readUint(read, txt, 2)
		if e != nil {
			return nil, e
		}
		nodes = append(nodes, SkillNode{ID: uint16(id), Level: binary.LittleEndian.Uint16(raw[nodeLevel:])})
		node = uintptr(binary.LittleEndian.Uint64(raw[nodeNext:]))
	}
	return nodes, nil
}

const MaxSkillPoints = 30 * MaxSkillLevel

// PointBalance caps grants at spendable capacity and exposes overspending instead of
// silently treating it as a normal zero balance. Received counts stay intact on disk.
type PointBalance struct{ Received, Spent, Unspent, Excess, Debt int }

func Balance(received, spent int) (PointBalance, error) {
	if received < 0 || spent < 0 || spent > MaxSkillPoints {
		return PointBalance{}, fmt.Errorf("invalid point accounting: received %d, spent %d", received, spent)
	}
	available := received
	if available > MaxSkillPoints {
		available = MaxSkillPoints
	}
	want := available - spent
	debt := 0
	if want < 0 {
		debt = -want
		want = 0
	}
	return PointBalance{received, spent, want, received - available, debt}, nil
}
func CountHardPoints(nodes []SkillNode, classIDs map[int]bool) (int, error) {
	if len(classIDs) != 30 {
		return 0, fmt.Errorf("expected 30 unique class skills")
	}
	total := 0
	seen := map[uint16]bool{}
	for _, n := range nodes {
		if !classIDs[int(n.ID)] {
			continue
		}
		// Item-provided duplicates cannot be distinguished safely yet. Refuse the
		// ambiguous snapshot rather than charging the player for equipment bonuses.
		if seen[n.ID] || n.Level > MaxSkillLevel {
			return 0, fmt.Errorf("ambiguous hard points for skill %d; inspect equipment and node diagnostics", n.ID)
		}
		seen[n.ID] = true
		total += int(n.Level)
	}
	return total, nil
}

func (c *Client) PID() uint32 { return c.proc.GetPID() }
func (c *Client) CharacterName(player uintptr) (string, error) {
	ptr, e := readUint(c.proc.ReadIntoBuffer, player+0x10, 8)
	if e != nil {
		return "", e
	}
	b := make([]byte, 16)
	if e = c.proc.ReadIntoBuffer(uintptr(ptr), b); e != nil {
		return "", e
	}
	end := bytes.IndexByte(b, 0)
	if end < 1 {
		return "", fmt.Errorf("invalid character name")
	}
	for _, v := range b[:end] {
		if v < 32 || v > 126 {
			return "", fmt.Errorf("unreadable character name")
		}
	}
	return string(b[:end]), nil
}
func (c *Client) ReadClass(player uintptr) (int, error) {
	v, e := readUint(c.proc.ReadIntoBuffer, player+offClass, 4)
	if e != nil {
		return 0, e
	}
	if v > 7 {
		return 0, fmt.Errorf("invalid class %d", v)
	}
	return int(v), nil
}
