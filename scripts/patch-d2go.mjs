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
