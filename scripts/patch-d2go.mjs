/**
 * patch-d2go.mjs — re-apply the D2RR fixes to the vendored copy of d2go.
 *
 * RUN THIS AFTER EVERY `go mod vendor`. That command regenerates the vendor tree from
 * the module cache and silently discards local edits — which is exactly how these
 * patches were lost once already, producing a nil-slice panic at runtime while every
 * test still passed.
 *
 * `internal/game/vendor_patch_test.go` asserts the markers are present, so `go test ./...`
 * now catches the same mistake instead of leaving it for the game to find.
 *
 * The three fixes, all upstream bugs rather than local preferences:
 *
 *  1. getProcessMemory issued ONE ReadProcessMemory across the whole ~40 MB module.
 *     Windows fails the entire call with ERROR_PARTIAL_COPY if any page in the range is
 *     unreadable, so it returned (nil, err) — and calculateOffsets discards that error.
 *
 *  2. findPattern looped to p.moduleBaseSize rather than len(memory), so the nil slice
 *     from (1) became an index-out-of-range panic instead of "not found".
 *
 *  3. The D2GS_SendPacket scan repeated bug (1) per-module, so it skipped D2R.exe and
 *     reported "pattern not found in any module".
 *
 * The fourth is an ADDITION rather than a fix: two accessors exposing the module base
 * and the resolved offsets. Upstream reaches those only through GetData(), which also
 * walks monsters, objects and the inventory and panics on an empty slice between game
 * states. The client needs two specific globals -- the live waypoint panel and the UI
 * flag block -- and nothing else.
 *
 *   node scripts/patch-d2go.mjs
 */
import fs from 'fs';
import path from 'path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const memDir = path.join(repoRoot, 'tools', 'ap-client', 'vendor',
                         'github.com', 'hectorgimenez', 'd2go', 'pkg', 'memory');

const CHUNKED_READER = `
// D2RR PATCH: read a module image in chunks, tolerating unreadable pages.
//
// A single ReadProcessMemory over a whole module fails with ERROR_PARTIAL_COPY if any
// page in the range is unreadable (guard pages, uncommitted regions). Retry per page and
// leave gaps zero-filled; every pattern lives in .text, which reads fine.
func readModuleChunked(h windows.Handle, base uintptr, size int) []byte {
	const chunk = 1 << 20
	const page = 4096

	data := make([]byte, size)
	got := 0
	for off := 0; off < size; off += chunk {
		n := chunk
		if off+n > size {
			n = size - off
		}
		if err := windows.ReadProcessMemory(h, base+uintptr(off), &data[off], uintptr(n), nil); err == nil {
			got += n
			continue
		}
		for q := 0; q < n; q += page {
			m := page
			if q+m > n {
				m = n - q
			}
			if e := windows.ReadProcessMemory(h, base+uintptr(off+q), &data[off+q], uintptr(m), nil); e == nil {
				got += m
			}
		}
	}
	if got == 0 {
		return nil
	}
	return data
}
`;


const ACCESSORS = `
// D2RR PATCH: expose the module base and the pattern-scanned offsets.
//
// Upstream surfaces these only via GetData(), which additionally reads monsters, objects
// and the inventory, and panics on an empty slice when the game is between states. The
// AP client wants two specific module-relative globals and nothing else:
//
//   - Offsets().WaypointsOffset, the live waypoint panel. The .d2s is not written when a
//     waypoint is taken, only on save-and-exit, so a save-derived check can lag an entire
//     session -- which in a multiworld leaves an item with its finder rather than its
//     owner.
//   - Offsets().UI, the UI flag block, which reads wrong on some builds and has to be
//     recalibrated by diffing the raw bytes rather than trusted.
func (gd *GameReader) ModuleBase() uintptr { return gd.moduleBaseAddressPtr }

// Offsets returns the resolved offsets. All are module-relative: add ModuleBase().
func (gd *GameReader) Offsets() Offset { return gd.offset }
`;

const patches = [
  {
    file: 'process.go',
    name: 'fmt import',
    find: '\t"errors"\n\t"strings"',
    replace: '\t"errors"\n\t"fmt"\n\t"strings"',
    skipIf: s => /^\t"fmt"$/m.test(s),
  },
  {
    file: 'process.go',
    name: 'chunked getProcessMemory',
    find: `func (p *Process) getProcessMemory() ([]byte, error) {
	var data = make([]byte, p.moduleBaseSize)
	err := windows.ReadProcessMemory(p.handler, p.moduleBaseAddressPtr, &data[0], uintptr(p.moduleBaseSize), nil)
	if err != nil {
		return nil, err
	}

	return data, nil
}`,
    replace: `${CHUNKED_READER}
func (p *Process) getProcessMemory() ([]byte, error) {
	data := readModuleChunked(p.handler, p.moduleBaseAddressPtr, int(p.moduleBaseSize))
	if data == nil {
		return nil, fmt.Errorf("could not read any of the module image at 0x%x (size %d)",
			p.moduleBaseAddressPtr, p.moduleBaseSize)
	}
	return data, nil
}`,
  },
  {
    file: 'process.go',
    name: 'bounded findPattern',
    find: `func (p *Process) findPattern(memory []byte, pattern, mask string) int {
	patternLength := len(pattern)
	for i := 0; i < int(p.moduleBaseSize)-patternLength; i++ {`,
    replace: `func (p *Process) findPattern(memory []byte, pattern, mask string) int {
	patternLength := len(pattern)
	// D2RR PATCH: bound by the slice we were given, not moduleBaseSize. Upstream trusted
	// the two to match, which panics on a short or empty read.
	limit := len(memory) - patternLength
	if limit < 0 {
		return 0
	}
	for i := 0; i < limit; i++ {`,
  },
  {
    file: 'game_reader.go',
    name: 'module base and offset accessors',
    find: 'func NewGameReader(process *Process) *GameReader {',
    replace: `${ACCESSORS}
func NewGameReader(process *Process) *GameReader {`,
    skipIf: s => /func \(gd \*GameReader\) ModuleBase\(\)/.test(s),
  },
  {
    file: 'send_packet.go',
    name: 'chunked module scan',
    find: `		memory := make([]byte, int(module.ModuleBaseSize))
		if err := windows.ReadProcessMemory(p.handler, module.ModuleBaseAddress, &memory[0], uintptr(module.ModuleBaseSize), nil); err != nil {
			log.Printf("Warning: failed to read module %s: %v", module.ModuleName, err)
			continue
		}`,
    replace: `		// D2RR PATCH: same chunked read as getProcessMemory. A single call over a whole
		// module fails with ERROR_PARTIAL_COPY on one unreadable page, which made this
		// scan skip D2R.exe entirely.
		memory := readModuleChunked(p.handler, module.ModuleBaseAddress, int(module.ModuleBaseSize))
		if memory == nil {
			log.Printf("Warning: failed to read any of module %s", module.ModuleName)
			continue
		}`,
  },
  // ── D2R 3.3 (build 3.3.93847) ─────────────────────────────────────────────
  // Re-derived on 2026-10-26 against a live game; see docs/archipelago/DESIGN_NOTES.md.
  {
    file: 'offset.go',
    name: '3.3 UI pattern fallbacks',
    find: String.raw`	// UI
	pattern = process.FindPattern(memory, "\x40\x84\xed\x0f\x94\x05", "xxxxxx")
	uiOffset := process.ReadUInt(pattern+6, Uint32)
	uiOffsetPtr := (pattern - process.moduleBaseAddressPtr) + 10 + uintptr(uiOffset)`,
    replace: String.raw`	// UI
	// D2RR PATCH: D2R 3.3 dropped the sete site. Fall back to two lea-of-uiBase sites
	// (uiBase = UI - 0xA) found on 3.3.93847, and leave UI at 0 when nothing matches so
	// callers can tell "unresolved" from an offset.
	var uiOffsetPtr uintptr
	if pattern = process.FindPattern(memory, "\x40\x84\xed\x0f\x94\x05", "xxxxxx"); pattern != 0 {
		uiOffset := process.ReadUInt(pattern+6, Uint32)
		uiOffsetPtr = (pattern - process.moduleBaseAddressPtr) + 10 + uintptr(uiOffset)
	} else if pattern = process.FindPattern(memory, "\x41\x0F\xB6\xE8\x48\x8D\x35\x00\x00\x00\x00\x85\xD2\x74", "xxxxxxx????xxx"); pattern != 0 {
		uiOffsetPtr = ripTarget(process, pattern+7) + 0xA
	} else if pattern = process.FindPattern(memory, "\x45\x33\xF6\x48\x8D\x35\x00\x00\x00\x00\x41\x8B\xDE\x48\x8D\x3D", "xxxxxx????xxxxxx"); pattern != 0 {
		uiOffsetPtr = ripTarget(process, pattern+6) + 0xA
	}`,
  },
  {
    file: 'offset.go',
    name: 'unresolved waypoint offset stays 0',
    find: String.raw`	pattern = process.FindPattern(memory, "\x48\x89\x05\x00\x00\x00\x00\x0F\x11\x00", "xxx????xxx")
	offsetBuffer := process.ReadUInt(pattern+3, Uint32)
	WaypointsOffset := pattern - process.moduleBaseAddressPtr + 23 + uintptr(offsetBuffer)`,
    replace: String.raw`	pattern = process.FindPattern(memory, "\x48\x89\x05\x00\x00\x00\x00\x0F\x11\x00", "xxx????xxx")
	// D2RR PATCH: this code page is only readable once the waypoint panel has run, so
	// the pattern is often missing at attach time. Keep 0 rather than a wild offset.
	var WaypointsOffset uintptr
	if pattern != 0 {
		offsetBuffer := process.ReadUInt(pattern+3, Uint32)
		WaypointsOffset = pattern - process.moduleBaseAddressPtr + 23 + uintptr(offsetBuffer)
	}`,
  },
  {
    file: 'offset.go',
    name: 'ripTarget helper',
    find: 'func calculateOffsets(process *Process) Offset {',
    replace: `// D2RR PATCH: module offset named by a rip-relative operand whose disp32 is at dispAddr.
func ripTarget(process *Process, dispAddr uintptr) uintptr {
	disp := int32(process.ReadUInt(dispAddr, Uint32))
	return uintptr(int64(dispAddr-process.moduleBaseAddressPtr) + 4 + int64(disp))
}

func calculateOffsets(process *Process) Offset {`,
    skipIf: s => s.includes('func ripTarget('),
  },
  {
    file: 'offset.go',
    name: 'known offsets per D2R build',
    find: `	return Offset{
		GameData:                    gameDataOffset,`,
    replace: `	// D2RR PATCH: D2R 3.3 keeps code pages unreadable except while they are in use, so
	// a pattern that matched a minute ago can miss now. Module offsets are fixed for a
	// given D2R.exe, so fall back to values measured on known builds.
	if known, ok := knownBuildOffsets[peTimestamp(process)]; ok {
		if uiOffsetPtr == 0 {
			uiOffsetPtr = known.UI
		}
		if WaypointsOffset == 0 {
			WaypointsOffset = known.WaypointsOffset
		}
	}

	return Offset{
		GameData:                    gameDataOffset,`,
  },
  {
    file: 'offset.go',
    name: 'known-build table',
    find: 'func calculateOffsets(process *Process) Offset {',
    replace: `// D2RR PATCH: module offsets measured on specific D2R.exe builds, keyed by the PE
// header's TimeDateStamp. Re-measure after a patch with the diff method in
// docs/archipelago/DESIGN_NOTES.md.
var knownBuildOffsets = map[uint32]Offset{
	0x6a6b96a4: {UI: 0x1ebd162, WaypointsOffset: 0x1d5f470}, // 3.3.93847
}

// D2RR PATCH: the TimeDateStamp of the loaded D2R.exe, which identifies the build.
func peTimestamp(process *Process) uint32 {
	base := process.moduleBaseAddressPtr
	pe := uintptr(process.ReadUInt(base+0x3C, Uint32))
	if process.ReadUInt(base+pe, Uint32) != 0x4550 { // "PE\\0\\0"
		return 0
	}
	return uint32(process.ReadUInt(base+pe+8, Uint32))
}

func calculateOffsets(process *Process) Offset {`,
    skipIf: s => s.includes('var knownBuildOffsets'),
  },
  {
    file: 'game_reader.go',
    name: 'offset rescan timestamp',
    find: '\tcachedObjects   []data.Object\n}',
    replace: '\tcachedObjects   []data.Object\n\n\t// D2RR PATCH: when GetData last rescanned for missing offsets.\n\toffsetsScanned time.Time\n}',
  },
  {
    file: 'game_reader.go',
    name: 'rescan offsets that were missing at attach',
    find: `	if gd.offset.UnitTable == 0 {
		gd.offset = calculateOffsets(gd.Process)
	}`,
    replace: `	// D2RR PATCH: D2R makes code pages readable as they first run, so a pattern can be
	// missing at attach time and present later. Rescan, at most every 2 s, while the UI
	// block or the waypoint list is still unresolved.
	// A rescan never discards an offset that an earlier scan resolved.
	if gd.offset.UnitTable == 0 || ((gd.offset.UI == 0 || gd.offset.WaypointsOffset == 0) && time.Since(gd.offsetsScanned) > 2*time.Second) {
		prev := gd.offset
		gd.offset = calculateOffsets(gd.Process)
		if gd.offset.UI == 0 {
			gd.offset.UI = prev.UI
		}
		if gd.offset.WaypointsOffset == 0 {
			gd.offset.WaypointsOffset = prev.WaypointsOffset
		}
		gd.offsetsScanned = time.Now()
	}`,
  },
  {
    file: 'game_reader.go',
    name: 'no menus from an unresolved UI offset',
    find: `func (gd *GameReader) OpenMenus() data.OpenMenus {
	uiBase :=`,
    replace: `func (gd *GameReader) OpenMenus() data.OpenMenus {
	// D2RR PATCH: UI 0 means unresolved; reading base-0xA would report PE header bytes.
	if gd.offset.UI == 0 {
		return data.OpenMenus{}
	}
	uiBase :=`,
  },
  {
    file: 'player.go',
    name: 'no waypoints from an unresolved offset',
    find: '\twpList := gd.Process.ReadBytesFromMemory(gd.moduleBaseAddressPtr+gd.offset.WaypointsOffset, 0x48)',
    replace: `	// D2RR PATCH: an unresolved offset (0) would read the PE header as a waypoint list.
	wpList := make([]byte, 0x48)
	if gd.offset.WaypointsOffset != 0 {
		if b := gd.Process.ReadBytesFromMemory(gd.moduleBaseAddressPtr+gd.offset.WaypointsOffset, 0x48); len(b) == 0x48 {
			wpList = b
		}
	}`,
  },
  {
    file: 'player.go',
    name: '3.3 state bitfield offset',
    find: '\t\tstateByte := gd.Process.ReadUInt(statsListExPtr+0xAF0+uintptr(offset), Uint32)',
    replace: '\t\t// D2RR PATCH: D2R 3.3 moved the state bitfield from +0xAF0 to +0xB30 (a second\n\t\t// copy sits at +0xB50).\n\t\tstateByte := gd.Process.ReadUInt(statsListExPtr+0xB30+uintptr(offset), Uint32)',
  },
  {
    file: 'player.go',
    name: 'shared-stash units are not the main player',
    find: '\treturn rawPlayerUnits\n}\n\nfunc (gd *GameReader) GetPlayerUnit(',
    replace: `	// D2RR PATCH: on D2R 3.3 the expansion-flag pattern does not resolve, so the classic
	// main-player test is true for the six shared-stash pseudo-players too. They carry
	// the Sharedstash state; drop the flag from them whenever it is ambiguous.
	mains := 0
	for _, u := range rawPlayerUnits {
		if u.IsMainPlayer {
			mains++
		}
	}
	if mains > 1 {
		for i := range rawPlayerUnits {
			if rawPlayerUnits[i].States.HasState(state.Sharedstash) {
				rawPlayerUnits[i].IsMainPlayer = false
			}
		}
	}
	return rawPlayerUnits
}

func (gd *GameReader) GetPlayerUnit(`,
  },
  {
    file: 'item.go',
    name: 'bounds-safe shared-stash owners',
    find: `			case 0:
				if itemOwnerNPC == 2 || itemOwnerNPC == uint(stashPlayerUnits[stashPlayerUnitOrder[0]].UnitID) {
					location = item.LocationSharedStash
					invPage = 1
				} else if itemOwnerNPC == 3 || itemOwnerNPC == uint(stashPlayerUnits[stashPlayerUnitOrder[1]].UnitID) {
					location = item.LocationSharedStash
					invPage = 2
				} else if itemOwnerNPC == 4 || itemOwnerNPC == uint(stashPlayerUnits[stashPlayerUnitOrder[2]].UnitID) {`,
    replace: `			case 0:
				// D2RR PATCH: upstream indexed stashPlayerUnitOrder blindly and panicked (taking
				// all of GetData down) whenever fewer than three stash units were identified.
				if itemOwnerNPC == 2 || itemOwnerNPC == stashOwnerID(stashPlayerUnits, stashPlayerUnitOrder, 0) {
					location = item.LocationSharedStash
					invPage = 1
				} else if itemOwnerNPC == 3 || itemOwnerNPC == stashOwnerID(stashPlayerUnits, stashPlayerUnitOrder, 1) {
					location = item.LocationSharedStash
					invPage = 2
				} else if itemOwnerNPC == 4 || itemOwnerNPC == stashOwnerID(stashPlayerUnits, stashPlayerUnitOrder, 2) {`,
  },
  {
    file: 'item.go',
    name: 'stashOwnerID helper',
    find: 'func (gd *GameReader) Inventory(rawPlayerUnits RawPlayerUnits, hover data.HoverData) data.Inventory {',
    replace: `// D2RR PATCH: unit id of the i-th shared-stash pseudo-player, or a value no item owner
// can hold when D2R did not expose that many.
func stashOwnerID(units map[uint]RawPlayerUnit, order []uint, i int) uint {
	if i >= len(order) {
		return ^uint(0)
	}
	return uint(units[order[i]].UnitID)
}

func (gd *GameReader) Inventory(rawPlayerUnits RawPlayerUnits, hover data.HoverData) data.Inventory {`,
    skipIf: s => s.includes('func stashOwnerID('),
  },
];

function main() {
  if (!fs.existsSync(memDir)) {
    console.error(`vendored d2go not found at ${memDir}`);
    console.error('Run `go mod vendor` in tools/ap-client first.');
    process.exit(2);
  }

  let applied = 0, already = 0;
  for (const p of patches) {
    const file = path.join(memDir, p.file);
    let src = fs.readFileSync(file, 'utf-8');

    if (p.skipIf ? p.skipIf(src) : src.includes(p.replace)) {
      already++;
      console.log(`  already applied: ${p.file} — ${p.name}`);
      continue;
    }
    if (!src.includes(p.find)) {
      console.error(`\nCannot apply "${p.name}" to ${p.file}: the upstream code does not match.`);
      console.error('d2go changed. Re-derive the patch before trusting the client.');
      process.exit(1);
    }
    fs.writeFileSync(file, src.replace(p.find, p.replace));
    applied++;
    console.log(`  applied: ${p.file} — ${p.name}`);
  }

  console.log(`\n${applied} patch(es) applied, ${already} already present.`);
  if (applied > 0) console.log('Rebuild the client: go build ./...');
}

main();
