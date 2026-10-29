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
  ...['pool.ts', 'fill.ts', 'starter-save.ts', 'hints.ts', 'options.ts'].map(f => path.join(src, f))], { stdio: 'inherit' });
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

// ── 2b. Acts IV/V, hardcore and names on the shipped templates ─────────────
{
  const dir = path.join(repo, 'data', 'starter-saves');
  // Words checked in game: Act V needs Terror's End (26) and Act IV completed (28).
  const ACCESS = { 2: [[7], 9], 3: [[15], 18], 4: [[23], 27], 5: [[26, 28], 30] };
  let checked = 0;
  for (const f of fs.readdirSync(dir).filter(n => n.endsWith('.d2s'))) {
    const t = fs.readFileSync(dir + '/' + f);
    const base = save.patchStarterSave(t, { name: 'Abc', startSkillSlot: null });
    const two3 = save.patchStarterSave(t, { name: 'Abc', startSkillSlot: null, openActs: [2, 3], hardcore: false });
    if (!base.equals(two3)) fail(`${f}: explicit Acts II–III differs from the default`);
    for (const acts of [[2], [2, 3], [2, 3, 4], [2, 3, 4, 5]]) {
      for (const hardcore of [false, true]) {
        const p = save.patchStarterSave(t, { name: 'Swanny-Sorc', startSkillSlot: null, openActs: acts, hardcore });
        if (save.d2sChecksum(p) !== p.readUInt32LE(12)) fail(`${f} ${acts}: checksum`);
        if (((p[20] & 0x04) !== 0) !== hardcore) fail(`${f}: hardcore bit ${p[20]}`);
        if ((p[20] & ~0x04) !== (t[20] & ~0x04)) fail(`${f}: other status bits changed`);
        if (p.toString('latin1', 299, 310) !== 'Swanny-Sorc' || p[310] !== 0) fail(`${f}: name bytes`);
        for (let d = 0; d < 3; d++) {
          const q = 403 + 10 + d * 96, wp = 701 + 8 + d * 24 + 2;
          const bit = b => (p[wp + (b >> 3)] >> (b & 7)) & 1;
          if (!bit(0)) fail(`${f}: Rogue Encampment waypoint`);
          for (const [act, [words, wpBit]] of Object.entries(ACCESS)) {
            const open = acts.includes(Number(act));
            for (const word of words) if ((p.readUInt16LE(q + word * 2) === 0x2001) !== open) fail(`${f} ${acts}: act ${act} word ${word} in difficulty ${d}`);
            if (bit(wpBit) !== (open ? 1 : 0)) fail(`${f} ${acts}: act ${act} waypoint ${wpBit} in difficulty ${d}`);
          }
        }
        // Outside the status byte, act words, waypoint bytes and checksum, nothing may differ from Acts II–III.
        const allowed = new Set([12, 13, 14, 15, 20]);
        for (let d = 0; d < 3; d++) {
          for (const w of [7, 15, 23, 26, 28]) { allowed.add(403 + 10 + d * 96 + w * 2); allowed.add(403 + 10 + d * 96 + w * 2 + 1); }
          for (let b = 0; b < 5; b++) allowed.add(701 + 8 + d * 24 + 2 + b);
        }
        const ref = save.patchStarterSave(t, { name: 'Swanny-Sorc', startSkillSlot: null });
        for (let i = 0; i < p.length; i++) if (p[i] !== ref[i] && !allowed.has(i)) { fail(`${f} ${acts}: byte ${i} changed`); break; }
        checked++;
      }
    }
  }
  console.log(`starter saves: ${checked} act/hardcore variants of the shipped templates check out`);
}

// ── 2c. options: ladder, names, cache keys, links ──────────────────────────
{
  const o = lib('options.js');
  const eq = (a, b, msg) => { if (JSON.stringify(a) !== JSON.stringify(b)) fail(`${msg}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`); };
  eq(o.normalizeOpenActs({ acts: [5] }).acts, [2, 3, 4, 5], 'Act V opens the acts before it');
  eq(o.normalizeOpenActs({ acts: [3, 9] }).acts, [2, 3], 'out-of-range acts ignored');
  eq(o.toggleActLadder([2, 3, 4], 3), [2], 'un-picking Act III closes III and IV');
  eq(o.toggleActLadder([2], 4), [2, 3, 4], 'picking Act IV opens II–IV');
  eq(o.normalizeOpenActs({ hardcore: true, name: 'Swanny' }), { ...o.DEFAULT_OPEN_ACTS }, 'hardcore and name need open acts');
  eq(o.normalizeOpenActs({ acts: [2], name: 'Bad1' }).name, '', 'invalid name dropped');
  eq(o.starterName('', 'Sorceress', false), 'Sorceress', 'no name → class name');
  eq(o.starterName('Swanny', 'Sorceress', false), 'Swanny-Sorc', 'tagged name');
  eq(o.starterName('Swanny', 'Sorceress', true), 'Swanny', 'single starter keeps the name');
  eq(o.starterName('Big_Dave', 'Necromancer', false), 'Big_DaveNecro', 'no second separator');
  const classes = ['Amazon', 'Sorceress', 'Necromancer', 'Paladin', 'Barbarian', 'Druid', 'Assassin', 'Warlock'];
  for (const base of ['Ab', 'Swanny', 'Abcdefghijklmno', 'Abcdefghijklm-n', 'A_bcdefghijklmn']) {
    const names = classes.map(c => o.starterName(base, c, false));
    if (new Set(names.map(n => n.toLowerCase())).size !== 8) fail(`${base}: starter names collide (${names})`);
    for (const n of names) if (!o.isValidCharacterName(n)) fail(`${base}: invalid starter name ${n}`);
  }
  // Keys from before hardcore/names/Acts IV–V must not change.
  eq(o.openActsCacheSegment(o.normalizeOpenActs({ shuffle: true, acts: [2, 3] })), ':open-acts-v1:sbhp:a23', 'old cache key');
  eq(o.openActsCacheSegment(o.normalizeOpenActs({ acts: [2] })), ':open-acts-v1:-:a2', 'old cache key (acts only)');
  eq(o.openActsCacheSegment(o.normalizeOpenActs({ acts: [5], hardcore: true, name: 'Swanny' })), ':open-acts-v1:-:a2345:hc:nSwanny', 'new cache key');
  for (const s of [{ shuffle: true, spoiler: false }, { acts: [4], hardcore: true }, { acts: [5], name: 'Big_Dave' }, { shuffle: true, bosses: false, acts: [3], name: 'Ab' }]) {
    for (const race of [false, true]) {
      const n = o.normalizeOpenActs(s, race);
      const q = new URLSearchParams(o.openActsToParams(n, race).slice(1));
      eq(o.openActsFromParams(k => q.get(k), race), n, `link round trip ${JSON.stringify(s)} race=${race}`);
    }
  }
  eq(o.openActsFeatureKeys(o.normalizeOpenActs({ acts: [4], hardcore: true }), { raceMode: false, classBuild: true }),
    ['open-acts', 'open-acts:acts-to-4', 'open-acts:hardcore', 'open-acts:class-builder'], 'feature keys');
  eq(o.openActsLabel([2, 3, 4]), 'Acts II, III and IV', 'act label');
  console.log('options: ladder, names, cache keys and links check out');
}

// ── 3. hints ───────────────────────────────────────────────────────────────
{
  const h = hints.hintStrings(sample.manifest);
  const actName = { 1: 'Act I', 2: 'Act II', 3: 'Act III' };
  const actOf = code => actName[sample.manifest.find(m => m.item === code).act];
  if (!h.qstsa2q22.includes(`Staff of Kings is somewhere in ${actOf('msf')}.`)) fail('staff hint wrong');
  if (!h.qstsa3q21.includes(actOf('qey') + '.')) fail('eye hint wrong');
  if (!h.qstsa1q11.includes(`Heart ${actOf('qhr').replace('Act ', '')}`)) fail('summary wrong');
  const noCube = hints.hintStrings(fill.shuffleOpenActs(1234, combos[1], modes).manifest);
  if (/Cube/.test(noCube.qstsa2q22)) fail('cube hint shown though the character starts with it');
  // The quest log shows no line breaks and has room for about 175 characters (seen in game).
  for (const opts of actCombos) for (let seed = 1; seed <= 200; seed++) {
    const all = { ...hints.hintStrings(fill.shuffleOpenActs(seed, opts, modes).manifest), ...hints.neutralStrings(opts.startWithCube) };
    for (const [key, text] of Object.entries(all)) {
      if (/\n/.test(text)) fail(`hint ${key} has a line break`);
      if (text.length > hints.HINT_MAX_LENGTH) fail(`hint ${key} is ${text.length} characters: ${text}`);
    }
  }
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
