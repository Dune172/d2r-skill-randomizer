//go:build windows

package main

import (
	"encoding/binary"
	"fmt"

	"github.com/hectorgimenez/d2go/pkg/data/state"
	"github.com/hectorgimenez/d2go/pkg/memory"
)

// scanLayout compares the real character (first unit) with the stash units to find
// where 3.3 keeps the state bitfield and the main-player flag.
func scanLayout(gr *memory.GameReader) {
	units := gr.GetRawPlayerUnits()
	if len(units) < 2 {
		fmt.Println("need the character plus stash units")
		return
	}
	s := int(state.Sharedstash)
	word, bit := s/32, uint(s%32)
	fmt.Printf("Sharedstash state id %d -> dword %d bit %d\n", s, word, bit)

	const n = 0x3000
	blocks := make([][]byte, len(units))
	for i, u := range units {
		ex := uintptr(gr.ReadUInt(u.Address+0x88, memory.Uint64))
		blocks[i] = gr.ReadBytesFromMemory(ex, n)
	}
	for off := 0; off+4 <= n; off += 4 {
		has := func(b []byte) bool { return len(b) >= off+4 && binary.LittleEndian.Uint32(b[off:])&(1<<bit) != 0 }
		if has(blocks[0]) {
			continue
		}
		all := true
		for _, b := range blocks[1:] {
			if !has(b) {
				all = false
				break
			}
		}
		if all {
			fmt.Printf("  states base candidate: statsListEx+%#x (bit found at +%#x)\n", off-word*4, off)
		}
	}

	inv := make([][]byte, len(units))
	for i, u := range units {
		addr := uintptr(gr.ReadUInt(u.Address+0x90, memory.Uint64))
		inv[i] = gr.ReadBytesFromMemory(addr, 0x200)
	}
	for off := 0; off+2 <= 0x200; off += 2 {
		v0 := binary.LittleEndian.Uint16(inv[0][off:])
		same, diff := true, true
		for _, b := range inv[1:] {
			v := binary.LittleEndian.Uint16(b[off:])
			if v != 0 {
				diff = false
			}
			if v != v0 {
				same = false
			}
		}
		if v0 != 0 && diff && !same {
			fmt.Printf("  main-flag candidate: inventory+%#x (char=%d, stash units=0)\n", off, v0)
		}
	}
}
