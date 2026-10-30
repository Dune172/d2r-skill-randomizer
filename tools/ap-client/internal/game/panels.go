//go:build windows

package game

import (
	"encoding/binary"
	"fmt"
	"sort"

	"github.com/hectorgimenez/d2go/pkg/data"
	"github.com/hectorgimenez/d2go/pkg/memory"
)

// PanelInfo is one node of the game's UI tree, for the playtest probe.
type PanelInfo struct {
	Path    string
	Addr    uintptr
	Visible bool
	Text    string
}

// Panels flattens the game's UI tree (playtest use).
func (c *Client) Panels() []PanelInfo {
	var out []PanelInfo
	var walk func(prefix string, m map[string]data.Panel)
	walk = func(prefix string, m map[string]data.Panel) {
		for name, p := range m {
			path := prefix + "/" + name
			out = append(out, PanelInfo{Path: path, Addr: p.PanelPtr, Visible: p.PanelVisible, Text: memory.GetText(p)})
			walk(path, p.PanelChildren)
		}
	}
	walk("", c.gr.ReadAllPanels())
	sort.Slice(out, func(i, j int) bool { return out[i].Path < out[j].Path })
	return out
}

// DumpStatContainer prints every {array, count, capacity} triple in a unit's stat
// container whose entries look like stats (playtest use).
func (c *Client) DumpStatContainer(unit uintptr) {
	read := c.proc.ReadIntoBuffer
	container, err := readUint(read, unit+offStatsListEx, 8)
	if err != nil {
		fmt.Println("container:", err)
		return
	}
	b := make([]byte, 0x400)
	if err := read(uintptr(container), b); err != nil {
		fmt.Println("container read:", err)
		return
	}
	fmt.Printf("container 0x%x\n", container)
	for off := 0; off+0x18 <= len(b); off += 8 {
		arr := binary.LittleEndian.Uint64(b[off:])
		n := binary.LittleEndian.Uint64(b[off+8:])
		cp := binary.LittleEndian.Uint64(b[off+16:])
		if arr < 0x10000 || n == 0 || n > 512 || cp < n || cp > 1024 {
			continue
		}
		e := make([]byte, n*8)
		if read(uintptr(arr), e) != nil {
			continue
		}
		fmt.Printf("+0x%03x array 0x%x count %d cap %d:", off, arr, n, cp)
		for i := 0; i < int(n); i++ {
			fmt.Printf(" %d/%d=%d", binary.LittleEndian.Uint16(e[i*8+2:]), binary.LittleEndian.Uint16(e[i*8:]), binary.LittleEndian.Uint32(e[i*8+4:]))
		}
		fmt.Println()
	}
}
