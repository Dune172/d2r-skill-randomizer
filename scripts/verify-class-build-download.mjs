// End-to-end /builder check against a running server: build → download → inspect.
// Run: node scripts/verify-class-build-download.mjs [baseUrl]   (default http://localhost:3000)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const AdmZip = require('adm-zip');
const base = process.argv[2] ?? 'http://localhost:3000';
const modules = new Map();
function load(name) {
  const file = path.resolve(root, name);
  if (modules.has(file)) return modules.get(file).exports;
  const mod = { exports: {} };
  modules.set(file, mod);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  new Function('require', 'module', 'exports', code)(spec =>
    spec.startsWith('.') ? load(path.resolve(path.dirname(file), `${spec}.ts`))
      : spec.startsWith('@/') ? load(path.join(root, 'src', `${spec.slice(2)}.ts`))
        : require(spec), mod, mod.exports);
  return mod.exports;
}
const { loadSkills, loadTreeGrid } = load('src/lib/data-loader.ts');
const { CLASS_DEFS } = load('src/lib/randomizer/config.ts');
const cb = load('src/lib/builder/class-build.ts');
const { encodeClassBuild } = load('src/lib/builder/class-build-codec.ts');
const skills = loadSkills();
const treePages = loadTreeGrid();

let ip = 0;
// Distinct client IPs so the per-IP generation limit doesn't stall the run.
const headers = () => ({ 'content-type': 'application/json', 'x-forwarded-for': `10.9.0.${++ip % 250}` });

async function build(code, extra = {}) {
  const r = await fetch(`${base}/api/randomize`, { method: 'POST', headers: headers(), body: JSON.stringify({ classBuild: code, ...extra }) });
  return { status: r.status, body: await r.json() };
}
async function download(query) {
  const r = await fetch(`${base}/api/download?${query}`, { headers: headers() });
  return { status: r.status, zip: r.ok ? new AdmZip(Buffer.from(await r.arrayBuffer())) : null };
}
function table(zip, name) {
  const entry = zip.getEntries().find(e => e.entryName.endsWith(`/data/global/excel/${name}`));
  const [h, ...rows] = entry.getData().toString('utf8').replace(/^﻿/, '').trimEnd().split(/\r?\n/).map(l => l.split('\t'));
  return { rows, get: (row, key) => row[h.indexOf(key)] };
}

const REQ = [1, 6, 12, 18, 24, 30];
let failures = 0;
async function check(label, fn) {
  try { await fn(); console.log(`ok   ${label}`); } catch (e) { failures++; console.log(`FAIL ${label}\n     ${e.message}`); }
}

for (const [i, def] of CLASS_DEFS.entries()) {
  await check(`${def.name}: build, download and inspect`, async () => {
    // Pages deliberately off their native tabs: tab 0 gets a tree-3 page, etc.
    let spec = cb.emptyBuild(def.code, 1000 + i);
    spec.pages = [cb.PAGE_REFS[(i * 3 + 2) % 24], cb.PAGE_REFS[(i * 3 + 7) % 24], cb.PAGE_REFS[(i * 3 + 9) % 24]].map(r => ({ ...r }));
    spec = cb.fillEmptySlots(spec, skills, treePages, 77 + i);
    const code = encodeClassBuild(spec, skills, treePages);

    const res = await build(code, { raceMode: true, weeklyChallenge: { enabled: true } });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.build, code);
    assert.match(res.body.modName, /^build[0-9a-f]{8}$/);
    assert.equal(res.body.seed, spec.seed);

    const { status, zip } = await download(`build=${code}`);
    assert.equal(status, 200);
    const modinfo = zip.getEntries().find(e => e.entryName.endsWith('modinfo.json'));
    assert.equal(JSON.parse(modinfo.getData().toString('utf8')).name, res.body.modName);
    assert.ok(!zip.getEntries().some(e => e.entryName.endsWith('.lnk') && e.getData().toString('utf16le').includes('-seed')),
      'Race Mode must be off for builds (no -seed in the launcher)');

    const sk = table(zip, 'skills.txt'), sd = table(zip, 'skilldesc.txt');
    const counts = {};
    for (const r of sk.rows) { const c = sk.get(r, 'charclass'); if (c) counts[c] = (counts[c] ?? 0) + 1; }
    for (const d of CLASS_DEFS) assert.equal(counts[d.code], 30, `${d.code} has ${counts[d.code]} rows`);

    const descBy = new Map(sd.rows.map(r => [r[0], r]));
    const pages = cb.resolvePages(spec, treePages);
    const ranks = cb.orderedSlotKeys(pages);
    for (const [key, name] of Object.entries(spec.slots)) {
      const [tab, row, col] = key.split('-').map(Number);
      const srow = sk.rows.find(r => r[0] === name);
      assert.equal(sk.get(srow, 'charclass'), def.code, `${name} charclass`);
      assert.equal(Number(sk.get(srow, 'reqlevel')), REQ[row - 1], `${name} reqlevel`);
      const d = descBy.get(sk.get(srow, 'skilldesc'));
      assert.deepEqual([sd.get(d, 'SkillPage'), sd.get(d, 'SkillRow'), sd.get(d, 'SkillColumn')].map(Number), [tab + 1, row, col], `${name} position`);
      assert.equal(Number(sd.get(d, 'IconCel')), ranks.indexOf(key) * 2, `${name} IconCel`);
    }

    // Second request is a cache hit and must not rebuild.
    const t0 = Date.now();
    assert.equal((await build(code)).status, 200);
    assert.ok(Date.now() - t0 < 1500, `cache hit took ${Date.now() - t0}ms`);
  });
}

await check('options travel in the download key', async () => {
  const spec = cb.fillEmptySlots(cb.emptyBuild('sor', 4242), skills, treePages, 1);
  const code = encodeClassBuild(spec, skills, treePages);
  const opts = { xpMultiplier: 2, xpActs: [2, 1], xpDifficulties: [1], enemyShuffle: true, disableChat: true,
    startingItems: { teleportStaff: true, teleportStaffLevel: 6, teleportStaffDropSource: 'Coldworm the Burrower', teleportStaffSpeed: false, horadricCube: true } };
  assert.equal((await build(code, opts)).status, 200);
  const q = `build=${code}&teleportStaff=6&dropSource=${encodeURIComponent('Coldworm the Burrower')}&staffSpeed=0&cube=1&disableChat=1&xpMultiplier=2&xpActs=1,2&xpDifficulties=1&enemyShuffle=1`;
  assert.equal((await download(q)).status, 200);
  assert.equal((await download(`build=${code}&cube=1`)).status, 404, 'a different option set must be a different zip');
});

await check('Open Acts on a build: shuffle, starters with Acts II–V, hardcore, name', async () => {
  const mo = load('src/lib/builder/mod-options.ts');
  const spec = cb.fillEmptySlots(cb.emptyBuild('dru', 5150), skills, treePages, 8);
  const code = encodeClassBuild(spec, skills, treePages);
  const opts = { ...mo.DEFAULT_MOD_OPTIONS, openActs: { ...mo.DEFAULT_MOD_OPTIONS.openActs, shuffle: true, acts: [5], hardcore: true, name: 'Tester' } };
  const r = await fetch(`${base}/api/randomize`, { method: 'POST', headers: headers(), body: mo.buildRandomizeBody(code, opts) });
  const body = await r.json();
  assert.equal(r.status, 200, JSON.stringify(body));
  // The download query must rebuild the same cache key (round trip through the share link too).
  const shared = mo.parseModOptions(new URLSearchParams(mo.buildShareQuery(code, opts)));
  assert.equal(mo.optionParams(shared), mo.optionParams(opts), 'share link loses Open Acts options');
  const { status, zip } = await download(mo.buildDownloadQuery(code, opts));
  assert.equal(status, 200, 'download key mismatch');
  const m = body.modName;
  const names = zip.getEntries().map(e => e.entryName);
  const saves = names.filter(n => n.startsWith(`${m}/starter-saves/`) && n.endsWith('.d2s'));
  assert.equal(saves.length, 8, `starters: ${saves}`);
  assert.ok(saves.includes(`${m}/starter-saves/Tester-Druid.d2s`), `names: ${saves}`);
  assert.ok(names.some(n => n.endsWith('/data/local/lng/strings/quests.json')), 'quests.json');
  assert.ok(names.some(n => n.endsWith('/data/global/excel/objects.txt')), 'objects.txt');
  const modinfo = JSON.parse(zip.getEntries().find(e => e.entryName.endsWith('modinfo.json')).getData().toString('utf8'));
  assert.equal(modinfo.savepath, `${m}_openacts`);
  const sk = table(zip, 'skills.txt'), cs = table(zip, 'charstats.txt');
  for (const e of zip.getEntries().filter(e => saves.includes(e.entryName))) {
    const b = e.getData();
    assert.ok(b[20] & 0x04, `${e.entryName} not hardcore`);
    for (let d = 0; d < 3; d++) for (const w of [7, 15, 23, 26, 28]) assert.equal(b.readUInt16LE(403 + 10 + d * 96 + w * 2), 0x2001, `${e.entryName} word ${w}`);
    const cls = CLASS_DEFS[b[24]];
    const start = cs.get(cs.rows.find(r => cs.get(r, 'class') === cls.name), 'StartSkill');
    const block = sk.rows.filter(r => sk.get(r, 'charclass') === cls.charclass);
    const slots = b.subarray(b.indexOf('if', b.indexOf('gf', 701, 'latin1') + 2, 'latin1') + 2).subarray(0, 30);
    const want = start ? block.findIndex(r => r[0] === start) : -1;
    assert.deepEqual([...slots].map((v, i) => v ? i : -1).filter(i => i >= 0), want >= 0 ? [want] : [], `${e.entryName} start skill`);
  }
  assert.equal((await download(`build=${code}&shuffleQuests=1&openActs=2,3,4,5&starterHc=1`)).status, 404, 'the name must be part of the key');
});

await check('incomplete, blocked and garbage codes are rejected', async () => {
  const draft = cb.emptyBuild('ama', 9);
  assert.equal((await build(encodeClassBuild(draft, skills, treePages))).status, 400);
  const full = cb.fillEmptySlots(cb.emptyBuild('nec', 9), skills, treePages, 3);
  const key = Object.keys(full.slots)[0];
  assert.equal((await build(encodeClassBuild({ ...full, slots: { ...full.slots, [key]: 'Charge' } }, skills, treePages))).status, 400);
  assert.equal((await build(encodeClassBuild({ ...full, slots: { ...full.slots, [key]: 'Whirlwind' } }, skills, treePages))).status, 400);
  assert.equal((await build('not-a-build')).status, 400);
  assert.equal((await download('build=not-a-build')).status, 400);
});

await check('preview shows the fixed class and all others', async () => {
  const spec = cb.fillEmptySlots(cb.emptyBuild('pal', 5), skills, treePages, 5);
  const r = await fetch(`${base}/api/preview`, { method: 'POST', headers: headers(), body: JSON.stringify({ classBuild: encodeClassBuild(spec, skills, treePages) }) });
  assert.equal(r.status, 200);
  const data = await r.json();
  assert.equal(data.seed, spec.seed);
  assert.equal(data.classes.length, 8);
  for (const c of data.classes) assert.equal(c.tabs.flatMap(t => t.skills).length, 30, c.code);
});

console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
