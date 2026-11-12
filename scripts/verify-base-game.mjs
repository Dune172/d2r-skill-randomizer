// Base-game mods (no Reign of the Warlock): tables come from data/txt/base/, land in
// data/global/excel/base/, and the Warlock is left out.
// Run: node --test scripts/verify-base-game.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import ts from 'typescript';
import AdmZip from 'adm-zip';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root); // the data loader reads data/ from the working directory
const require = createRequire(import.meta.url);
const modules = new Map();
function load(name) {
  const file = path.resolve(root, name);
  if (modules.has(file)) return modules.get(file).exports;
  if (file.endsWith('.json')) return require(file);
  const mod = { exports: {} };
  modules.set(file, mod);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, resolveJsonModule: true },
  }).outputText;
  const resolve = spec => {
    const base = spec.startsWith('.') ? path.resolve(path.dirname(file), spec) : path.join(root, 'src', spec.slice(2));
    if (spec.endsWith('.json')) return base;
    return fs.existsSync(`${base}.ts`) ? `${base}.ts` : fs.existsSync(`${base}.tsx`) ? `${base}.tsx` : path.join(base, 'index.ts');
  };
  new Function('require', 'module', 'exports', code)(spec =>
    spec.startsWith('.') || spec.startsWith('@/') ? load(resolve(spec)) : require(spec), mod, mod.exports);
  return mod.exports;
}

const { generateMod } = load('src/lib/randomizer/generate-mod.ts');
const { DEFAULT_OPEN_ACTS } = load('src/lib/randomizer/open-acts/options.ts');
const { pickRaceClassIndex, CLASS_NAMES } = load('src/lib/classes.ts');
const bg = load('src/lib/base-game.ts');

const OPTS = {
  classBuild: null, weeklyEnabled: false, weekNumber: 0, forgottenArts: false, enablePrereqs: true,
  playersEnabled: false, playersCount: 1, playersActs: [], startingTeleportStaff: true,
  teleportStaffLevel: 1, teleportStaffDropSource: 'Corpsefire', teleportStaffSpeed: false,
  hirelingAura: true, disableChat: false, startingHoradricCube: false, xpMultiplier: 1,
  xpActs: [], xpDifficulties: [], raceMode: false, enemyShuffle: false,
  openActs: DEFAULT_OPEN_ACTS, mutationIds: [], customMutations: [],
  extras: { seasonal: false, anyClassItems: false },
};

const readTable = (text) => {
  const lines = text.replace(/\r/g, '').split('\n').filter(Boolean).map(l => l.split('\t'));
  return { headers: lines[0], rows: lines.slice(1) };
};
const source = (name) => readTable(fs.readFileSync(path.join(root, 'data', 'txt', 'base', name), 'utf8'));

async function build(seed, extra = {}) {
  const { zip, modName, savepath } = await generateMod(seed, { ...OPTS, baseGame: true, ...extra });
  const entries = new AdmZip(zip).getEntries();
  const files = new Map(entries.map(e => [e.entryName, e]));
  const table = (name) => {
    const e = files.get(`${modName}.mpq/data/global/excel/base/${name}`);
    assert.ok(e, `${modName}: missing excel/base/${name}`);
    return readTable(e.getData().toString('utf8'));
  };
  return { modName, savepath, files, table };
}

function checkMod(mod, label) {
  const names = [...mod.files.keys()];
  const txt = names.filter(n => n.endsWith('.txt') && n.includes('/data/global/'));
  assert.ok(txt.length > 5, `${label}: no table files`);
  for (const n of txt) {
    if (n.endsWith('DataVersionBuild.txt')) continue;
    assert.match(n, /\/data\/global\/excel\/base\/[^/]+\.txt$/, `${label}: ${n} is not under excel/base/`);
  }

  const skills = mod.table('skills.txt');
  const src = source('skills.txt');
  assert.equal(skills.headers.length, src.headers.length, `${label}: skills.txt columns`);
  assert.equal(skills.rows.length, src.rows.length, `${label}: skills.txt rows`);
  const cc = skills.headers.indexOf('charclass');
  // The game numbers skills by row. The Warlock block (rows 373-402) is never shuffled,
  // so it stays exactly as in the base table, in place.
  for (let i = 373; i <= 402; i++) {
    assert.deepEqual(skills.rows[i], src.rows[i], `${label}: Warlock row ${i} (${src.rows[i][0]}) changed`);
  }
  const perClass = new Map();
  for (const r of skills.rows) if (r[cc]) perClass.set(r[cc], (perClass.get(r[cc]) ?? 0) + 1);
  for (const c of ['ama', 'sor', 'nec', 'pal', 'bar', 'dru', 'ass']) {
    assert.equal(perClass.get(c), 30, `${label}: ${c} has ${perClass.get(c)} skills`);
  }
  assert.equal(perClass.get('war'), 30, `${label}: the Warlock keeps only its own 30 vanilla rows`);

  // Every class skill's skilldesc must exist in the shipped skilldesc.txt.
  const descs = new Set(mod.table('skilldesc.txt').rows.map(r => r[0]));
  const sd = skills.headers.indexOf('skilldesc');
  for (const r of skills.rows) {
    if (r[cc] && r[cc] !== 'war' && r[sd]) assert.ok(descs.has(r[sd]), `${label}: ${r[0]} → missing skilldesc ${r[sd]}`);
  }

  const charstats = mod.table('charstats.txt');
  assert.equal(charstats.headers.length, source('charstats.txt').headers.length, `${label}: charstats.txt columns`);
  const warRow = charstats.rows.find(r => r[0] === 'Warlock');
  const srcWar = source('charstats.txt').rows.find(r => r[0] === 'Warlock');
  const startSkill = charstats.headers.indexOf('StartSkill');
  assert.equal(warRow[startSkill], srcWar[startSkill], `${label}: Warlock StartSkill changed`);
  for (const r of charstats.rows) {
    if (!r[0] || r[0] === 'Warlock' || r[0] === 'Expansion') continue;
    const own = skills.rows.find(s => s[0] === r[startSkill]);
    assert.ok(own, `${label}: ${r[0]} StartSkill ${r[startSkill]} is not a skill`);
  }

  const monstats = mod.table('monstats.txt');
  assert.equal(monstats.headers.length, source('monstats.txt').headers.length, `${label}: monstats.txt columns`);

  // Shared art: no Warlock skill tree or icon sheet, since its trees are vanilla.
  assert.ok(!mod.files.has(`${mod.modName}.mpq/data/hd/global/ui/spells/skill_trees/waskilltree.sprite`), `${label}: Warlock tree sprite shipped`);

  const readme = mod.files.get('README.txt')?.getData().toString('utf8') ?? '';
  assert.match(readme, /WITHOUT Reign of the Warlock/, `${label}: README has no base-game note`);
}

test('base-game mods: tables in excel/base, seven classes shuffled, Warlock untouched', async () => {
  for (const seed of [1, 2, 3, 42, 777, 123456789, 0, 2026, 99999, 31337]) {
    const mod = await build(seed);
    assert.equal(mod.modName, `seed${seed}base`);
    assert.equal(mod.savepath, 'D2RRandomizerBase');
    checkMod(mod, `seed ${seed}`);
  }
});

test('base-game mods with Race Mode and Monster Shuffle', async () => {
  for (const seed of [7, 8, 15, 16, 23, 64, 1000, 4242]) {
    const mod = await build(seed, { raceMode: true, enemyShuffle: true, playersEnabled: true, playersCount: 3, playersActs: [1, 2, 3, 4, 5], xpMultiplier: 2, xpActs: [1, 2, 3, 4, 5], xpDifficulties: [0, 1, 2] });
    checkMod(mod, `race seed ${seed}`);
    const race = CLASS_NAMES[pickRaceClassIndex(seed, true)];
    assert.notEqual(race, 'Warlock', `race seed ${seed}`);
    assert.ok(mod.savepath.startsWith(`seed${seed}base`), mod.savepath);
    assert.ok(mod.files.has('enemy-shuffle.json'), `race seed ${seed}: no enemy shuffle`);
  }
});

test('base-game mods with a partial shuffle and extras', async () => {
  for (const seed of [5, 6]) {
    checkMod(await build(seed, { shuffleAmount: 50, skillPoints: 2, extras: { seasonal: false, anyClassItems: true } }), `partial seed ${seed}`);
  }
});

test('the race class is never the Warlock in a base-game mod', () => {
  for (let seed = 0; seed < 5000; seed++) assert.ok(pickRaceClassIndex(seed, true) < 7);
  // ...and the normal pick is unchanged.
  for (let seed = 0; seed < 64; seed++) assert.equal(pickRaceClassIndex(seed), seed % 8);
});

test('base-game mods refuse the expansion-only options', async () => {
  await assert.rejects(build(1, { mutationIds: [1], customMutations: [1] }), /base-game/);
  await assert.rejects(build(1, { weeklyEnabled: true, weekNumber: 20 }), /base-game/);
  await assert.rejects(build(1, { forgottenArts: true }), /base-game/);
  await assert.rejects(build(1, { openActs: { ...DEFAULT_OPEN_ACTS, acts: [2] } }), /base-game/);
});

test('option helpers: off adds nothing, on round-trips', () => {
  assert.equal(bg.normalizeBaseGame({}), false);
  assert.equal(bg.normalizeBaseGame({ baseGame: 'true' }), false);
  assert.equal(bg.normalizeBaseGame({ baseGame: true }), true);
  assert.deepEqual(bg.baseGameParams(false), []);
  assert.equal(bg.baseGameCacheSegment(false), '');
  const q = new URLSearchParams(bg.baseGameParams(true).join('&'));
  assert.equal(bg.baseGameFromParams(k => q.get(k)), true);
  assert.equal(bg.baseGameFromParams(() => null), false);
  assert.equal(bg.baseGameModName('seed5', false), 'seed5');
  assert.equal(bg.baseGameConflict({ baseGame: false, mutations: 3, openActs: true }), null);
  assert.ok(bg.baseGameConflict({ baseGame: true, mutations: 1 }));
  assert.ok(bg.baseGameConflict({ baseGame: true, openActs: true }));
  assert.ok(bg.baseGameConflict({ baseGame: true, warlockInBuild: true }));
});
