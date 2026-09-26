// Verifies the Autumn Towns season gate and the shipped overlay.
//   node scripts/verify-autumn.mjs [--src D:/D2RModding/data/data]
// With --src (a CASC extraction), also checks every texture override keeps its
// vanilla width, height and mip count (downscaled overrides render as blobs).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';

const AdmZip = createRequire(import.meta.url)('adm-zip');
const args = process.argv.slice(2);
const src = args.includes('--src') ? args[args.indexOf('--src') + 1] : null;

// ── Season gate ──────────────────────────────────────────────────────────────
const code = ts.transpileModule(fs.readFileSync('src/lib/autumn/season.ts', 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const mod = { exports: {} };
vm.runInNewContext(code, { module: mod, exports: mod.exports, Intl, process: { env: {} } });
const { isAutumnSeason } = mod.exports;
const cases = [
  ['2026-10-01T06:59:59Z', false], // Sep 30 23:59:59 PDT
  ['2026-10-01T07:00:00Z', true],  // Oct 1 00:00 PDT
  ['2026-11-15T12:00:00Z', true],
  ['2026-12-01T07:59:59Z', true],  // Nov 30 23:59:59 PST
  ['2026-12-01T08:00:00Z', false], // Dec 1 00:00 PST
  ['2027-10-10T12:00:00Z', true],  // every year
  ['2027-03-10T12:00:00Z', false],
  ['2031-11-30T20:00:00Z', true],
  ['2031-09-30T20:00:00Z', false],
];
for (const [iso, expected] of cases) {
  assert.equal(isAutumnSeason(new Date(iso)), expected, `isAutumnSeason(${iso})`);
}
console.log(`season gate: ${cases.length} boundary cases ok`);

// ── Overlay integrity ────────────────────────────────────────────────────────
const zip = new AdmZip('data/autumn/overlay.zip');
const MANIFEST = '_autumn_manifest.json';
const manifest = JSON.parse(zip.readAsText(MANIFEST) || '{}');
const dataVersion = fs.readFileSync('data/dataversionbuild.txt', 'utf8').trim();
assert.equal(manifest.dataVersionBuild, dataVersion,
  `overlay was built for DataVersionBuild ${manifest.dataVersionBuild} but game data is ${dataVersion}: ` +
  'the server will skip it. Re-extract and rebuild it (docs/autumn-towns.md)');
console.log(`manifest: built ${manifest.builtAt} for DataVersionBuild ${dataVersion}, ${Object.keys(manifest.sources ?? {}).length} vanilla sources`);
const files = new Map(zip.getEntries().filter(e => !e.isDirectory && e.entryName !== MANIFEST).map(e => [e.entryName, e.getData()]));
assert.ok(files.size > 0, 'overlay is empty');
const refs = new Set();
for (const [name, buf] of files) {
  if (!name.endsWith('.json')) continue;
  const text = buf.toString('utf8');
  JSON.parse(text); // must parse
  for (const m of text.matchAll(/"(data\/hd\/(?:d2rr|bvt)\/[^"]+)"/g)) refs.add(m[1]);
}
for (const ref of refs) {
  const rel = ref.slice(5);
  const candidates = rel.endsWith('.model') ? [rel.replace('.model', '_lod0.model')] : [rel];
  assert.ok(candidates.some(c => files.has(c)), `overlay references ${ref} but does not ship it`);
}
console.log(`overlay: ${files.size} files, ${refs.size} custom asset references all shipped`);

const presets = [...files.keys()].filter(n => n.startsWith('hd/env/preset/'));
assert.equal(presets.length, 9, 'expected 9 town presets');
for (const p of presets) {
  const doc = JSON.parse(files.get(p).toString('utf8'));
  const props = doc.entities.filter(e => e.name.startsWith('d2rr_'));
  assert.ok(props.length > 0, `${p}: no decorations`);
  for (const e of props) assert.ok(!e.components.some(c => c.type === 'PhysicsBodyDefinitionComponent'), `${p}: ${e.name} has collision`);
}
console.log(`presets: ${presets.length} towns decorated, no decoration has collision`);

if (src) {
  // Vanilla sources unchanged since the overlay was built (a D2R patch that
  // touches them means the overlay must be rebuilt).
  const { createHash } = await import('node:crypto');
  const changed = Object.entries(manifest.sources).filter(([rel, sha]) =>
    createHash('sha1').update(fs.readFileSync(`${src}/${rel}`)).digest('hex') !== sha).map(([rel]) => rel);
  assert.deepEqual(changed, [], `vanilla files changed since the overlay was built; rebuild it:\n  ${changed.join('\n  ')}`);
  console.log(`vanilla sources: ${Object.keys(manifest.sources).length} unchanged since build`);
  let n = 0;
  for (const [name, buf] of files) {
    if (!name.endsWith('.texture') || name.startsWith('hd/d2rr/')) continue;
    const vanilla = fs.readFileSync(`${src}/${name}`);
    for (const [off, label] of [[8, 'width'], [12, 'height'], [28, 'mips']])
      assert.equal(buf.readUInt32LE(off), vanilla.readUInt32LE(off), `${name}: ${label} differs from vanilla`);
    assert.equal(buf[4], vanilla[4], `${name}: format differs from vanilla`);
    n++;
  }
  console.log(`texture overrides: ${n} match vanilla size, mips and format`);
}
console.log('verify-autumn: ok');
