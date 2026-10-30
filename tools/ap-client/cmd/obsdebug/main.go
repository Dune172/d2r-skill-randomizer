//go:build windows

// obsdebug is a developer tool, not part of the client release: it re-derives d2go
// offsets after a D2R patch. Run it with a character loaded. See "After a D2R patch" in
// docs/archipelago/DESIGN_NOTES.md for the method.
//
//	obsdebug [pieces]         call each GetData piece and report panics
//	obsdebug units            dump player units and layout candidates
//	obsdebug snap <file>      save the D2R.exe module image
//	obsdebug diff <a> <b>     list bytes that went 0 -> 1..4 from snapshot a to b (no game needed)
//	obsdebug pat              try the waypoint and UI patterns, and show a fresh reader's offsets
//	obsdebug wp               search the module for the Act I waypoint area list
//	obsdebug items            list the inventory
//	obsdebug objs             list objects around the player
package main

import (
	"encoding/binary"
	"fmt"
	"os"
	"runtime/debug"
	"strings"

	"github.com/hectorgimenez/d2go/pkg/memory"
	"golang.org/x/sys/windows"
)

func try(name string, f func() any) {
	defer func() {
		if r := recover(); r != nil {
			fmt.Printf("PANIC %-14s %v\n%s\n", name, r, debug.Stack())
		}
	}()
	s := fmt.Sprintf("%+v", f())
	if len(s) > 160 {
		s = s[:160] + "..."
	}
	fmt.Printf("ok    %-14s %s\n", name, s)
}

func module(pid uint32) memory.ModuleInfo {
	mods, err := memory.GetProcessModules(pid)
	if err != nil {
		panic(err)
	}
	for _, m := range mods {
		if strings.Contains(strings.ToLower(m.ModuleName), "d2r") {
			return m
		}
	}
	for _, m := range mods {
		fmt.Println("module:", m.ModuleName)
	}
	return mods[0]
}

func readModule(pid uint32) (memory.ModuleInfo, []byte) {
	m := module(pid)
	h, err := windows.OpenProcess(windows.PROCESS_VM_READ|windows.PROCESS_QUERY_INFORMATION, false, pid)
	if err != nil {
		panic(err)
	}
	defer windows.CloseHandle(h)
	buf := make([]byte, m.ModuleBaseSize)
	for off := 0; off < len(buf); off += 4096 {
		n := 4096
		if off+n > len(buf) {
			n = len(buf) - off
		}
		_ = windows.ReadProcessMemory(h, m.ModuleBaseAddress+uintptr(off), &buf[off], uintptr(n), nil)
	}
	return m, buf
}

// subcommands maps each subcommand to the number of arguments it takes.
var subcommands = map[string]int{
	"pieces": 0, "units": 0, "snap": 1, "diff": 2, "pat": 0, "wp": 0, "items": 0, "objs": 0,
}

func main() {
	cmd, args := "pieces", []string{}
	if len(os.Args) > 1 {
		cmd, args = os.Args[1], os.Args[2:]
	}
	if n, ok := subcommands[cmd]; !ok || len(args) != n {
		fmt.Fprintln(os.Stderr, "usage: obsdebug [pieces | units | snap <file> | diff <a> <b> | pat | wp | items | objs]")
		os.Exit(2)
	}
	if cmd == "diff" {
		os.Exit(diffSnapshots(args[0], args[1]))
	}

	proc, err := memory.NewProcess()
	if err != nil {
		fmt.Println("no D2R:", err)
		os.Exit(1)
	}
	gr := memory.NewGameReader(proc)
	switch cmd {
	case "units":
		dumpUnits(gr)
		scanLayout(gr)
	case "snap":
		_, buf := readModule(proc.GetPID())
		if err := os.WriteFile(args[0], buf, 0o644); err != nil {
			fmt.Println("ERROR:", err)
			os.Exit(1)
		}
		fmt.Printf("saved %d bytes\n", len(buf))
	case "pat":
		m, buf := readModule(proc.GetPID())
		p := proc.FindPattern(buf, "\x48\x89\x05\x00\x00\x00\x00\x0F\x11\x00", "xxx????xxx")
		fmt.Printf("waypoint pattern: %#x (module+%#x)\n", p, p-m.ModuleBaseAddress)
		p = proc.FindPattern(buf, "\x40\x84\xed\x0f\x94\x05", "xxxxxx")
		fmt.Printf("old UI pattern: %#x\n", p)
		fresh := memory.NewGameReader(proc).Offsets()
		fmt.Printf("fresh reader offsets: UI=%#x Waypoints=%#x Expansion=%#x\n", fresh.UI, fresh.WaypointsOffset, fresh.Expansion)
	case "items":
		raw := gr.GetRawPlayerUnits()
		for _, it := range gr.Inventory(raw, gr.HoveredData()).AllItems {
			fmt.Printf("  classID=%d name=%s code=%q loc=%s\n", it.ID, it.Name, it.Desc().Code, it.Location.LocationType)
		}
	case "objs":
		mp := gr.GetRawPlayerUnits().GetMainPlayer()
		fmt.Printf("player at %d,%d area %d\n", mp.Position.X, mp.Position.Y, mp.Area)
		for _, o := range gr.Objects(mp.Position, gr.HoveredData()) {
			fmt.Printf("  obj %v id=%d at %d,%d (dx %d dy %d) mode %v\n", o.Name, int(o.Name), o.Position.X, o.Position.Y,
				o.Position.X-mp.Position.X, o.Position.Y-mp.Position.Y, o.Mode)
		}
	case "wp":
		_, buf := readModule(proc.GetPID())
		want := []uint32{1, 3, 4, 5, 6, 27, 29, 32, 35}
		for i := 0; i+0x48 <= len(buf); i += 4 {
			ok := true
			for k, id := range want {
				if binary.LittleEndian.Uint32(buf[i+k*8:]) != id {
					ok = false
					break
				}
			}
			if ok {
				fmt.Printf("act I wp list at module+%#x: % x\n", i, buf[i:i+0x48])
			}
		}
	case "pieces":
		raw := gr.GetRawPlayerUnits()
		mp := raw.GetMainPlayer()
		fmt.Printf("main player %q at %#x, %d raw units\n", mp.Name, mp.Address, len(raw))
		pu := gr.GetPlayerUnit(mp)
		hover := gr.HoveredData()
		try("Monsters", func() any { return len(gr.Monsters(pu.Position, hover)) })
		try("Inventory", func() any { return len(gr.Inventory(raw, hover).AllItems) })
		try("Objects", func() any { return len(gr.Objects(pu.Position, hover)) })
		try("OpenMenus", func() any { return gr.OpenMenus() })
		try("Waypoints", func() any { return pu.AvailableWaypoints })
		try("GetData", func() any { return gr.GetData().PlayerUnit.Name })
	}
}

// diffSnapshots lists the offsets whose byte went from 0 to a small value (1..4) between
// two module snapshots, which is how a flag set by a UI action is found.
func diffSnapshots(before, after string) int {
	a, err := os.ReadFile(before)
	if err != nil {
		fmt.Println("ERROR:", err)
		return 1
	}
	b, err := os.ReadFile(after)
	if err != nil {
		fmt.Println("ERROR:", err)
		return 1
	}
	n := 0
	for i := range a {
		if i < len(b) && a[i] == 0 && b[i] != 0 && b[i] <= 4 {
			fmt.Printf("+%#x: 0 -> %d\n", i, b[i])
			n++
		}
	}
	fmt.Println("total", n)
	return 0
}
