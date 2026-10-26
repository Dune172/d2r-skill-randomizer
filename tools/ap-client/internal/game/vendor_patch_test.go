package game

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// The vendored copy of d2go carries three local fixes for upstream bugs. `go mod vendor`
// regenerates the vendor tree from the module cache and silently discards them — which
// has happened once already, and produced a nil-slice PANIC at runtime while every test
// still passed and the build was clean.
//
// These tests exist so `go test ./...` catches that instead of the game finding it.
// If they fail: node scripts/patch-d2go.mjs
const vendorMemoryDir = "../../vendor/github.com/hectorgimenez/d2go/pkg/memory"

func readVendored(t *testing.T, name string) string {
	t.Helper()
	data, err := os.ReadFile(filepath.Join(vendorMemoryDir, name))
	if err != nil {
		t.Skipf("vendored d2go not present (%v) — run `go mod vendor`", err)
	}
	return string(data)
}

func TestVendoredD2GoIsPatched(t *testing.T) {
	process := readVendored(t, "process.go")
	sendPacket := readVendored(t, "send_packet.go")
	gameReader := readVendored(t, "game_reader.go")
	offset := readVendored(t, "offset.go")
	player := readVendored(t, "player.go")
	item := readVendored(t, "item.go")

	checks := []struct {
		file, src, needle, why string
	}{
		{
			file: "process.go", src: process, needle: "func readModuleChunked(",
			why: "a single ReadProcessMemory over a ~40MB module fails with " +
				"ERROR_PARTIAL_COPY on one unreadable page, and calculateOffsets " +
				"discards the error",
		},
		{
			file: "process.go", src: process, needle: "limit := len(memory) - patternLength",
			why: "findPattern loops to moduleBaseSize rather than len(memory), so an " +
				"empty read becomes an index-out-of-range panic instead of 'not found'",
		},
		{
			file: "send_packet.go", src: sendPacket, needle: "readModuleChunked(p.handler, module.ModuleBaseAddress",
			why: "the D2GS_SendPacket scan repeats the same single-read bug per module, " +
				"so it skips D2R.exe and reports 'pattern not found in any module'",
		},
		{
			file: "game_reader.go", src: gameReader, needle: "func (gd *GameReader) ModuleBase() uintptr",
			why: "without it the module base is unreachable, and the only other route to " +
				"the waypoint and UI globals is GetData(), which panics between game states",
		},
		{
			file: "game_reader.go", src: gameReader, needle: "func (gd *GameReader) Offsets() Offset",
			why: "the pattern-scanned offsets are otherwise private, so live waypoint " +
				"checks cannot be read at all",
		},
		// D2R 3.3 (build 3.3.93847)
		{
			file: "offset.go", src: offset, needle: "var knownBuildOffsets",
			why: "3.3 keeps code pages unreadable except while in use, so the UI and " +
				"waypoint patterns miss intermittently; measured offsets cover them",
		},
		{
			file: "game_reader.go", src: gameReader, needle: "prev := gd.offset",
			why: "without the rescan, offsets missing at attach stay missing for the session",
		},
		{
			file: "player.go", src: player, needle: "statsListExPtr+0xB30+",
			why: "3.3 moved the state bitfield; at +0xAF0 every unit reads no states",
		},
		{
			file: "player.go", src: player, needle: "HasState(state.Sharedstash)",
			why: "on 3.3 the six shared-stash units also claim to be the main player",
		},
		{
			file: "item.go", src: item, needle: "func stashOwnerID(",
			why: "Inventory indexed the stash-unit list blindly and panicked, taking all " +
				"of GetData down with it",
		},
	}

	for _, c := range checks {
		if !strings.Contains(c.src, c.needle) {
			t.Errorf("%s is MISSING a D2RR patch (%q).\n"+
				"  Why it matters: %s\n"+
				"  Fix: node scripts/patch-d2go.mjs",
				c.file, c.needle, c.why)
		}
	}
}

// The upstream code the patches replace must be gone, not merely accompanied. A partial
// application would still contain the panicking loop.
func TestUnpatchedUpstreamCodeIsAbsent(t *testing.T) {
	process := readVendored(t, "process.go")

	if strings.Contains(process, "for i := 0; i < int(p.moduleBaseSize)-patternLength; i++") {
		t.Error("findPattern still loops to moduleBaseSize — the patch did not apply cleanly")
	}
	if strings.Contains(process, "err := windows.ReadProcessMemory(p.handler, p.moduleBaseAddressPtr, &data[0]") {
		t.Error("getProcessMemory still does a single whole-module read — the patch did not apply cleanly")
	}
}
