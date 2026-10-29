//go:build windows

package game

import (
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"testing"
)

// The vendored copy of d2go carries local fixes for upstream bugs and for D2R 3.3, all
// applied by scripts/patch-d2go.mjs. `go mod vendor` regenerates the vendor tree from
// the module cache and silently discards them — which has happened once already, and
// produced a nil-slice PANIC at runtime while every test still passed and the build was
// clean.
//
// These tests exist so `go test ./...` catches that instead of the game finding it.
// If they fail: node scripts/patch-d2go.mjs
const (
	vendorMemoryDir = "../../vendor/github.com/hectorgimenez/d2go/pkg/memory"
	patchScript     = "../../../../scripts/patch-d2go.mjs"
)

func readVendored(t *testing.T, name string) string {
	t.Helper()
	data, err := os.ReadFile(filepath.Join(vendorMemoryDir, name))
	if err != nil {
		t.Skipf("vendored d2go not present (%v) — run `go mod vendor`", err)
	}
	return string(data)
}

// vendorPatch is one entry of scripts/patch-d2go.mjs, by its name there, and text that
// is present only once that patch has been applied.
type vendorPatch struct {
	name, file, needle, why string
}

var vendorPatches = []vendorPatch{
	{"fmt import", "process.go", "\t\"errors\"\n\t\"fmt\"\n",
		"getProcessMemory's error message needs fmt"},
	{"chunked getProcessMemory", "process.go", "func readModuleChunked(",
		"a single ReadProcessMemory over a ~40MB module fails with ERROR_PARTIAL_COPY on " +
			"one unreadable page, and calculateOffsets discards the error"},
	{"bounded findPattern", "process.go", "limit := len(memory) - patternLength",
		"findPattern loops to moduleBaseSize rather than len(memory), so an empty read " +
			"becomes an index-out-of-range panic instead of 'not found'"},
	{"module base and offset accessors", "game_reader.go", "func (gd *GameReader) Offsets() Offset",
		"without them the module base and the scanned offsets are unreachable, and the only " +
			"other route to the waypoint and UI globals is GetData(), which panics between game states"},
	{"chunked module scan", "send_packet.go", "readModuleChunked(p.handler, module.ModuleBaseAddress",
		"the D2GS_SendPacket scan repeats the single-read bug per module, so it skips D2R.exe"},
	{"3.3 UI pattern fallbacks", "offset.go", "uiOffsetPtr = ripTarget(process, pattern+7) + 0xA",
		"D2R 3.3 dropped the sete site the upstream UI pattern matched"},
	{"unresolved waypoint offset stays 0", "offset.go", "\tvar WaypointsOffset uintptr\n",
		"a missed waypoint pattern otherwise yields a wild offset instead of 0"},
	{"ripTarget helper", "offset.go", "func ripTarget(process *Process, dispAddr uintptr) uintptr",
		"the 3.3 UI fallbacks resolve rip-relative operands through it"},
	{"known offsets per D2R build", "offset.go", "if known, ok := knownBuildOffsets[peTimestamp(process)]; ok {",
		"3.3 keeps code pages unreadable except while in use, so the UI and waypoint " +
			"patterns miss intermittently; measured offsets cover them"},
	{"known-build table", "offset.go", "var knownBuildOffsets = map[uint32]Offset{",
		"the measured offsets per D2R.exe build"},
	{"exported build identity", "offset.go", "func KnownBuild(timestamp uint32) bool",
		"doctor names the build and says whether it has measured offsets"},
	{"offset rescan timestamp", "game_reader.go", "\toffsetsScanned time.Time\n",
		"the rescan below is rate-limited by it"},
	{"rescan offsets that were missing at attach", "game_reader.go", "prev := gd.offset",
		"without the rescan, offsets missing at attach stay missing for the session"},
	{"no menus from an unresolved UI offset", "game_reader.go", "if gd.offset.UI == 0 {\n\t\treturn data.OpenMenus{}",
		"UI 0 would read the PE header as menu flags"},
	{"no waypoints from an unresolved offset", "player.go", "if gd.offset.WaypointsOffset != 0 {",
		"WaypointsOffset 0 would read the PE header as a waypoint list"},
	{"3.3 state bitfield offset", "player.go", "statsListExPtr+0xB30+",
		"3.3 moved the state bitfield; at +0xAF0 every unit reads no states"},
	{"shared-stash units are not the main player", "player.go", "HasState(state.Sharedstash)",
		"on 3.3 the six shared-stash units also claim to be the main player"},
	{"bounds-safe shared-stash owners", "item.go", "stashOwnerID(stashPlayerUnits, stashPlayerUnitOrder, 0)",
		"Inventory indexed the stash-unit list blindly and panicked, taking all of GetData down with it"},
	{"stashOwnerID helper", "item.go", "func stashOwnerID(",
		"the bounds-safe owner lookup above calls it"},
}

func TestVendoredD2GoIsPatched(t *testing.T) {
	for _, p := range vendorPatches {
		if !strings.Contains(readVendored(t, p.file), p.needle) {
			t.Errorf("%s is MISSING the D2RR patch %q (looked for %q).\n"+
				"  Why it matters: %s\n"+
				"  Fix: node scripts/patch-d2go.mjs",
				p.file, p.name, p.needle, p.why)
		}
	}
}

// Every patch the script applies must be checked above, so a new patch cannot be added
// without a test noticing when it goes missing.
func TestEveryScriptPatchIsChecked(t *testing.T) {
	raw, err := os.ReadFile(patchScript)
	if err != nil {
		t.Skipf("patch script not present (%v)", err)
	}
	var inScript []string
	for _, m := range regexp.MustCompile(`(?m)^\s+name: '([^']+)',\s*$`).FindAllStringSubmatch(string(raw), -1) {
		inScript = append(inScript, m[1])
	}
	var inTest []string
	for _, p := range vendorPatches {
		inTest = append(inTest, p.name)
	}
	sort.Strings(inScript)
	sort.Strings(inTest)
	if strings.Join(inScript, "\n") != strings.Join(inTest, "\n") {
		t.Fatalf("patch names differ.\n script: %q\n test:   %q", inScript, inTest)
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
	if strings.Contains(readVendored(t, "player.go"), "statsListExPtr+0xAF0+") {
		t.Error("the pre-3.3 state bitfield offset is still read")
	}
}
