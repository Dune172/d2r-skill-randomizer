// Offline checks for the Open Acts module (src/lib/randomizer/open-acts):
//   1. the shuffle: beatable, "interesting", host rules, deterministic, over many seeds
//   2. the starter-save patcher, against saves already tested in game (if present)
//   3. the quest-log hints, against the game's quests.json (if extracted)
// Usage: node scripts/verify-open-acts-fill.mjs [seeds=3000] [questsJsonPath=data/local/strings/quests.json]
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';

const repo = process.cwd();
const seeds = Number(process.argv[2] ?? 3000);
const questsPath = process.argv[3] ?? path.join(repo, "data", "local", "strings", "quests.json");
const require = createRequire(import.meta.url);

// ── compile the module to CommonJS in a temp dir ───────────────────────────
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'open-acts-'));
const src = path.join(repo, 'src', 'lib', 'randomizer', 'open-acts');
// Worktrees have no node_modules of their own; Node's lookup walks up to the main checkout.
execFileSync(process.execPath, [require.resolve('typescript/bin/tsc', { paths: [repo] }),
  '--outDir', out, '--rootDir', path.join(repo, 'src'), '--module', 'commonjs', '--target', 'es2022',
  '--moduleResolution', 'node', '--strict', '--skipLibCheck', '--types', 'node',
  ...['pool.ts', 'fill.ts', 'starter-save.ts', 'hints.ts'].map(f => path.join(src, f))], { stdio: 'inherit' });
const lib = p => require(path.join(out, 'lib', 'randomizer', 'open-acts', p));
const pool = lib('pool.js');
const fill = lib('fill.js');
const save = lib('starter-save.js');
const hints = lib('hints.js');

let failures = 0;
const fail = msg => { failures++; if (failures <= 20) console.log(`FAIL ${msg}`); };

// ── host modes from objects.txt ────────────────────────────────────────────
const objLines = fs.readFileSync(path.join(repo, 'data', 'txt', 'objects.txt'), 'latin1').split(/\r?\n/);
const oh = objLines[0].split('\t');
const modes = new Map();
for (const l of objLines.slice(1)) {
  const c = l.split('\t');
  if (c[oh.indexOf('Class')]) modes.set(c[oh.indexOf('Class')], c[oh.indexOf('Mode1')] === '1');
}

// ── 1. shuffle ─────────────────────────────────────────────────────────────
const combos = [
  { startWithCube: false, bossLocations: true },
  { startWithCube: true, bossLocations: true },
  { startWithCube: false, bossLocations: false },
  { startWithCube: true, bossLocations: false },
];
// The same four with Act III closed (shuffle with only Act II open) and with every act
// closed (shuffle only, any ordinary character). A closed Act III is reached through Duriel.
const actCombos = [...combos, ...[[2], []].flatMap(openActs => combos.map(c => ({ ...c, openActs })))];
for (const opts of actCombos) {
  const locs = new Map(pool.activeLocations(opts).map(l => [l.id, l]));
  const freq = {};
  let maxTries = 0, totalTries = 0, gatedSeeds = 0;
  const depth = {};
  for (let seed = 1; seed <= seeds; seed++) {
    let r;
    try { r = fill.shuffleOpenActs(seed, opts, modes); } catch (e) { fail(`${JSON.stringify(opts)} seed ${seed}: ${e.message}`); continue; }
    maxTries = Math.max(maxTries, r.tries); totalTries += r.tries;
    if (!fill.beatable(r.placements, opts)) fail(`seed ${seed} not beatable`);
    if (!fill.interesting(r.placements, opts)) fail(`seed ${seed} not interesting`);
    const keys = pool.keyItems(opts);
    const placedItems = [...r.placements.values()];
    for (const k of keys) if (placedItems.filter(i => i === k).length !== 1) fail(`seed ${seed}: key ${k} placed ${placedItems.filter(i => i === k).length}×`);
    for (const f of pool.fillerItems()) if (!placedItems.includes(f)) fail(`seed ${seed}: filler ${f} missing`);
    if (opts.startWithCube && placedItems.includes('box')) fail(`seed ${seed}: cube placed though the character starts with it`);
    for (const [id, item] of r.placements) {
      const loc = locs.get(id);
      if (!pool.canHost(loc, pool.ITEMS[item], modes)) fail(`seed ${seed}: ${loc.id} cannot host ${item}`);
      (freq[item] ??= {})[id] = ((freq[item] ??= {})[id] ?? 0) + 1;
    }
    const objects = pool.LOCATIONS.filter(l => l.kind === 'object');
    if (r.objectHandlers.size !== objects.length) fail(`seed ${seed}: ${r.objectHandlers.size} object handlers`);
    if (r.objectHandlers.get('Malus') === 12) fail(`seed ${seed}: Malus got 12`);
    if (!opts.bossLocations && r.bossDrops.length) fail(`seed ${seed}: boss drops with bosses off`);
    if (r.bossDrops.some(b => b.item === 'bks')) fail(`seed ${seed}: Inifuss scroll on a boss`);
    if (opts.openActs && !opts.openActs.includes(3)) {
      // Act III opens only after Duriel, so nothing Duriel needs may sit there: the Cube and
      // Staff, and the Inifuss scroll when one of them is behind Tristram.
      const where = k => locs.get([...r.placements].find(([, item]) => item === k)?.[0]);
      const needed = ['box', 'msf'].filter(k => where(k));
      if (needed.some(k => where(k).gate === 'tristram')) needed.push('bks');
      for (const k of needed) if (where(k).act === 3) fail(`seed ${seed} ${JSON.stringify(opts)}: ${k} in closed Act III`);
    }
    if (r.manifest.some(m => m.key && locs.get(m.location).gate !== 'none')) gatedSeeds++;
    const maxSphere = Math.max(...r.manifest.filter(m => m.key).map(m => m.sphere));
    depth[maxSphere] = (depth[maxSphere] ?? 0) + 1;
    if (seed <= 50) {
      const again = fill.shuffleOpenActs(seed, opts, modes);
      if (JSON.stringify(again.manifest) !== JSON.stringify(r.manifest)) fail(`seed ${seed}: not deterministic`);
    }
  }
  console.log(`\n${JSON.stringify(opts)}: ${seeds} seeds, tries avg ${(totalTries / seeds).toFixed(1)} max ${maxTries}, ` +
    `gated key in ${(100 * gatedSeeds / seeds).toFixed(0)}%, deepest key sphere ${JSON.stringify(depth)}`);
  for (const item of [...pool.keyItems(opts), ...pool.fillerItems()]) {
    const row = Object.entries(freq[item] ?? {}).sort((a, b) => b[1] - a[1]).map(([id, n]) => `${id} ${(100 * n / seeds).toFixed(0)}%`);
    console.log(`  ${item}: ${row.join(', ')}`);
  }
}
const sample = fill.shuffleOpenActs(1234, combos[0], modes);
console.log('\nseed 1234 playthrough:');
for (const m of sample.manifest) console.log(`  sphere ${m.sphere}  ${m.itemName.padEnd(18)} ${m.key ? 'KEY' : '   '}  Act ${m.act}  ${m.locationName}`);

// ── 2. starter saves ───────────────────────────────────────────────────────
// Fixtures: a fresh test Barbarian and the starter built from it by the spike (Normal only).
const fixtures = path.join(repo, "scripts", "open-acts-spike", "saves");
const bak = path.join(fixtures, "ssssssssssss.d2s.bak");
const spike = path.join(fixtures, "Spiketest.d2s");
if (fs.existsSync(bak) && fs.existsSync(spike)) {
  const template = fs.readFileSync(bak);
  const before = Buffer.from(template);
  const patched = save.patchStarterSave(template, { name: 'Spiketest', startSkillSlot: 18 });
  if (!template.equals(before)) fail('patchStarterSave modified its template');
  if (save.d2sChecksum(patched) !== patched.readUInt32LE(12)) fail('checksum does not validate');
  const known = fs.readFileSync(spike);
  // Spiketest opened Normal only; the module also opens Nightmare and Hell.
  const extra = new Set();
  for (const d of [1, 2]) {
    for (const w of [7, 15]) for (let b = 0; b < 2; b++) extra.add(403 + 10 + d * 96 + w * 2 + b);
    for (let b = 0; b < 5; b++) extra.add(701 + 8 + d * 24 + 2 + b);
  }
  for (let i = 12; i < 16; i++) extra.add(i);
  const diffs = [];
  for (let i = 0; i < known.length; i++) if (known[i] !== patched[i] && !extra.has(i)) diffs.push(i);
  if (diffs.length) fail(`patched save differs from the tested Spiketest at ${diffs.join(',')}`);
  for (const d of [0, 1, 2]) {
    const q = 403 + 10 + d * 96, wp = 701 + 8 + d * 24 + 2;
    if (patched.readUInt16LE(q + 14) === 0 || patched.readUInt16LE(q + 30) === 0) fail(`difficulty ${d} act flags unset`);
    if (!(patched[wp + 1] & 0x02) || !(patched[wp + 2] & 0x04)) fail(`difficulty ${d} town waypoints unset`);
  }
  if (patched[21] !== 0) fail('progression byte changed');
  console.log(`\nstarter save: matches the in-game-tested Spiketest outside the Nightmare/Hell additions (${diffs.length} stray diffs)`);
  for (const bad of ['a', 'Ab-c_d', '-Abc', 'Abcdefghijklmnop', 'Ab1']) if (save.isValidCharacterName(bad)) fail(`name ${bad} accepted`);
  for (const good of ['Amazon', 'Open-Barb', 'Ab']) if (!save.isValidCharacterName(good)) fail(`name ${good} rejected`);
} else {
  console.log('\nstarter save: fixtures missing, skipped');
}
{
  const sk = fs.readFileSync(path.join(repo, 'data', 'txt', 'skills.txt'), 'latin1').split(/\r?\n/).filter(Boolean).map(l => l.split('\t'));
  const [h, ...rows] = sk;
  const firstBar = rows.findIndex(r => r[h.indexOf('charclass')] === 'bar');
  const name = rows[firstBar + 18][h.indexOf('skill')];
  if (save.startSkillSlot(h, rows, 'bar', name) !== 18) fail('startSkillSlot does not find slot 18');
  if (save.startSkillSlot(h, rows, 'bar', '') !== null) fail('empty StartSkill should give null');
}

// ── 3. hints ───────────────────────────────────────────────────────────────
{
  const h = hints.hintStrings(sample.manifest);
  const actName = { 1: 'Act I', 2: 'Act II', 3: 'Act III' };
  const actOf = code => actName[sample.manifest.find(m => m.item === code).act];
  if (!h.qstsa2q22.includes(`Staff of Kings is somewhere in ${actOf('msf')}.`)) fail('staff hint wrong');
  if (!h.qstsa3q21.includes(actOf('qey') + '.')) fail('eye hint wrong');
  if (!h.qstsa1q11.includes(`Khalim's Heart: ${actOf('qhr')}`)) fail('summary wrong');
  const noCube = hints.hintStrings(fill.shuffleOpenActs(1234, combos[1], modes).manifest);
  if (/Cube/.test(noCube.qstsa2q22)) fail('cube hint shown though the character starts with it');
  if (questsPath && fs.existsSync(questsPath)) {
    const entries = JSON.parse(fs.readFileSync(questsPath, 'utf8').replace(/^﻿/, ''));
    hints.applyHints(entries, h);
    const staff = entries.find(e => e.Key === 'qstsa2q22');
    if (staff.deDE !== h.qstsa2q22 || staff.enUS !== h.qstsa2q22) fail('applyHints missed a locale');
    console.log(`hints: applied ${Object.keys(h).length} lines to quests.json in every locale`);
  }
  console.log('\nseed 1234 Den of Evil line:\n' + h.qstsa1q11.split('\n').map(l => '  ' + l).join('\n'));
}

fs.rmSync(out, { recursive: true, force: true });
console.log(failures ? `\n${failures} FAILURES` : '\nALL CHECKS PASSED');
process.exit(failures ? 1 : 0);
