// Verifies the seasonal gate and the shipped seasonal HD overlays.
//   node scripts/verify-season.mjs [--season autumn|winter] [--src D:/D2RModding/data/data]
// Without --season, checks every season. With --src (a CASC extraction), also
// checks the vanilla sources are unchanged since the build, every texture
// override keeps its vanilla width, height and mip count (downscaled overrides
// render as blobs), and every vanilla file the overlay points at exists.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import ts from 'typescript';

const AdmZip = createRequire(import.meta.url)('adm-zip');
const args = process.argv.slice(2);
const arg = name => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : null);
const src = arg('src');
const seasons = arg('season') ? [arg('season')] : ['autumn', 'winter'];

// ── Season gate ──────────────────────────────────────────────────────────────
const code = ts.transpileModule(fs.readFileSync('src/lib/seasons/season.ts', 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const load = env => {
  const mod = { exports: {} };
  vm.runInNewContext(code, { module: mod, exports: mod.exports, Intl, process: { env } });
  return mod.exports.currentSeason;
};
const currentSeason = load({});
const cases = [
  ['2026-10-01T06:59:59Z', null],     // Sep 30 23:59:59 PDT
  ['2026-10-01T07:00:00Z', 'autumn'], // Oct 1 00:00 PDT
  ['2026-11-15T12:00:00Z', 'autumn'],
  ['2026-12-01T07:59:59Z', 'autumn'], // Nov 30 23:59:59 PST
  ['2026-12-01T08:00:00Z', 'winter'], // Dec 1 00:00 PST
  ['2027-01-01T07:59:59Z', 'winter'], // Dec 31 23:59:59 PST
  ['2027-01-01T08:00:00Z', 'winter'], // Jan 1 00:00 PST: across the year boundary
  ['2027-02-01T07:59:59Z', 'winter'], // Jan 31 23:59:59 PST
  ['2027-02-01T08:00:00Z', null],     // Feb 1 00:00 PST
  ['2027-03-10T12:00:00Z', null],
  ['2027-10-10T12:00:00Z', 'autumn'], // every year
  ['2031-11-30T20:00:00Z', 'autumn'],
  ['2031-12-25T20:00:00Z', 'winter'],
  ['2031-09-30T20:00:00Z', null],
];
for (const [iso, expected] of cases) assert.equal(currentSeason(new Date(iso)), expected, `currentSeason(${iso})`);
const count = { autumn: 0, winter: 0 };
for (let t = Date.UTC(2026, 0, 1, 20); t < Date.UTC(2033, 0, 1); t += 86400000) {
  const s = currentSeason(new Date(t));
  if (s) count[s]++;
}
assert.ok(count.autumn > 60 * 7 && count.winter > 60 * 7, `season day counts ${JSON.stringify(count)}`);
assert.equal(load({ D2RR_SEASON: 'winter' })(new Date('2026-06-01T12:00:00Z')), 'winter', 'D2RR_SEASON=winter');
assert.equal(load({ D2RR_SEASON: 'off' })(new Date('2026-12-15T12:00:00Z')), null, 'D2RR_SEASON=off');
assert.equal(load({ D2RR_AUTUMN: '1' })(new Date('2026-06-01T12:00:00Z')), 'autumn', 'D2RR_AUTUMN=1');
assert.equal(load({ D2RR_AUTUMN: '0' })(new Date('2026-10-15T12:00:00Z')), null, 'D2RR_AUTUMN=0');
assert.equal(load({ D2RR_AUTUMN: '0' })(new Date('2026-12-15T12:00:00Z')), 'winter', 'D2RR_AUTUMN=0 leaves winter alone');
console.log(`season gate: ${cases.length} boundary cases, 7 years of days (${count.autumn} autumn, ${count.winter} winter), overrides ok`);

// ── Overlay integrity ────────────────────────────────────────────────────────
const dataVersion = fs.readFileSync('data/dataversionbuild.txt', 'utf8').trim();
for (const season of seasons) {
  const zip = new AdmZip(`data/${season}/overlay.zip`);
  const MANIFEST = `_${season}_manifest.json`;
  const manifest = JSON.parse(zip.readAsText(MANIFEST) || '{}');
  assert.equal(manifest.dataVersionBuild, dataVersion,
    `${season} overlay was built for DataVersionBuild ${manifest.dataVersionBuild} but game data is ${dataVersion}: ` +
    `the server will skip it. Re-extract and rebuild it (docs/${season}-towns.md)`);
  console.log(`[${season}] manifest: built ${manifest.builtAt} for DataVersionBuild ${dataVersion}, ${Object.keys(manifest.sources ?? {}).length} vanilla sources`);
  const files = new Map(zip.getEntries().filter(e => !e.isDirectory && e.entryName !== MANIFEST).map(e => [e.entryName, e.getData()]));
  assert.ok(files.size > 0, `${season} overlay is empty`);
  const refs = new Set(), vanillaRefs = new Set();
  for (const [name, buf] of files) {
    if (!name.endsWith('.json')) continue;
    const text = buf.toString('utf8');
    JSON.parse(text); // must parse
    for (const m of text.matchAll(/"(data\/hd\/[^"]+\.(?:model|texture|particles|json|dds))"/g))
      (/^data\/hd\/(?:d2rr|bvt)\//.test(m[1]) ? refs : vanillaRefs).add(m[1]);
  }
  const shipped = ref => {
    const rel = ref.slice(5);
    return [rel, rel.replace(/\.model$/, '_lod0.model')].some(c => files.has(c));
  };
  for (const ref of refs) assert.ok(shipped(ref), `${season} overlay references ${ref} but does not ship it`);
  console.log(`[${season}] overlay: ${files.size} files, ${refs.size} custom asset references all shipped`);

  const presets = [...files.keys()].filter(n => n.startsWith('hd/env/preset/'));
  assert.equal(presets.length, 9, `${season}: expected 9 town presets`);
  for (const p of presets) {
    const doc = JSON.parse(files.get(p).toString('utf8'));
    const props = doc.entities.filter(e => e.name.startsWith('d2rr_'));
    assert.ok(props.length > 0, `${season} ${p}: no decorations`);
    for (const e of props) assert.ok(!e.components.some(c => c.type === 'PhysicsBodyDefinitionComponent'), `${season} ${p}: ${e.name} has collision`);
  }
  console.log(`[${season}] presets: ${presets.length} towns decorated, no decoration has collision`);

  if (src) {
    const changed = Object.entries(manifest.sources).filter(([rel, sha]) =>
      createHash('sha1').update(fs.readFileSync(`${src}/${rel}`)).digest('hex') !== sha).map(([rel]) => rel);
    assert.deepEqual(changed, [], `${season}: vanilla files changed since the overlay was built; rebuild it:\n  ${changed.join('\n  ')}`);
    console.log(`[${season}] vanilla sources: ${Object.keys(manifest.sources).length} unchanged since build`);
    let n = 0;
    for (const [name, buf] of files) {
      if (!name.endsWith('.texture') || name.startsWith('hd/d2rr/')) continue;
      const vanilla = fs.readFileSync(`${src}/${name}`);
      for (const [off, label] of [[8, 'width'], [12, 'height'], [28, 'mips']])
        assert.equal(buf.readUInt32LE(off), vanilla.readUInt32LE(off), `${season} ${name}: ${label} differs from vanilla`);
      assert.equal(buf[4], vanilla[4], `${season} ${name}: format differs from vanilla`);
      n++;
    }
    console.log(`[${season}] texture overrides: ${n} match vanilla size, mips and format`);
    // Vanilla files the overlay points at (Act V snow textures, snow props...)
    // must exist, in the overlay or the game data.
    const exists = ref => shipped(ref) || [ref.slice(5), ref.slice(5).replace(/\.model$/, '_lod0.model')]
      .some(c => fs.existsSync(`${src}/${c}`) || fs.existsSync(`${src}/${c.toLowerCase()}`));
    // Only references the overlay added: some vanilla presets already point
    // at files that don't exist.
    const REF = /"(data\/hd\/[^"]+\.(?:model|texture|particles|json|dds))"/g;
    const vanillaHad = new Set();
    for (const name of files.keys()) if (name.endsWith('.json') && fs.existsSync(`${src}/${name}`))
      for (const m of fs.readFileSync(`${src}/${name}`, 'utf8').matchAll(REF)) vanillaHad.add(m[1]);
    const missing = [...vanillaRefs].filter(r => !vanillaHad.has(r) && !exists(r));
    assert.deepEqual(missing, [], `${season}: overlay references files that do not exist:\n  ${missing.join('\n  ')}`);
    console.log(`[${season}] vanilla references: ${[...vanillaRefs].filter(r => !vanillaHad.has(r)).length} added by the overlay, all exist`);
  }
}
console.log('verify-season: ok');
