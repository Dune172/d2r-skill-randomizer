/**
 * Player-picked mutations (Generate page): the shared rules in
 * src/lib/mutations/custom.ts, and every allowed combination applied to the real
 * data/txt tables through the shipped orchestrator.
 *
 * Run: node --test scripts/verify-custom-mutations.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const modules = new Map();
// In-memory TS loader running the actual implementation, with the '@/' alias.
function load(name) {
  const filename = path.resolve(root, name);
  if (modules.has(filename)) return modules.get(filename).exports;
  const module = { exports: {} };
  modules.set(filename, module);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const localRequire = spec => {
    if (!spec.startsWith('.') && !spec.startsWith('@/')) return require(spec);
    const target = spec.startsWith('@/') ? path.join(root, 'src', spec.slice(2)) : path.resolve(path.dirname(filename), spec);
    if (target.endsWith('.json')) return require(target);
    return load(fs.existsSync(`${target}.ts`) ? `${target}.ts` : path.join(target, 'index.ts'));
  };
  new Function('require', 'module', 'exports', code)(localRequire, module, module.exports);
  return module.exports;
}

const custom = load('src/lib/mutations/custom.ts');
const { MUTATIONS, EXCLUSIVE_MUTATION_PAIRS, WEEKLY_MUTATIONS, getMutationIds } = load('src/lib/mutations/registry.ts');
const orchestrator = load('src/lib/randomizer/mutations/index.ts');
const { loadTxtFile } = load('src/lib/data-loader.ts');
const { makeCacheKey } = load('src/lib/zip-cache.ts');

const {
  PICKABLE_MUTATION_IDS, normalizeMutationIds, findMutationConflict, findConflictingPair,
  encodeMutationParam, parseMutationParam, mutationCacheSegment, mutationSavepathSuffix,
  mutationOptionConflict, validateMutations, mutationFeatureKeys,
} = custom;

test('every registry mutation but the challenge-only ones is pickable', () => {
  const all = Object.keys(MUTATIONS).map(Number).sort((a, b) => a - b);
  // Forgotten Arts (19), Krampus Is Coming (20) and Cold Snap (21) are challenge-only.
  assert.deepEqual(PICKABLE_MUTATION_IDS, all.filter(id => ![19, 20, 21].includes(id)));
  for (const id of PICKABLE_MUTATION_IDS) {
    assert.ok(fs.existsSync(path.join(root, 'public/mutations', `${MUTATIONS[id].id}.webp`)), `image for ${id}`);
  }
});

test('normalize keeps pickable ids only, deduped and sorted', () => {
  assert.deepEqual(normalizeMutationIds([7, '5', 5, 19, 99, -1, 1.5, 'x', null, 1]), [1, 5, 7]);
  assert.deepEqual(normalizeMutationIds('1.5'), []);
  assert.deepEqual(normalizeMutationIds(undefined), []);
});

test('the share/download param round-trips', () => {
  assert.equal(encodeMutationParam([7, 1, 5, 5]), '1.5.7');
  assert.deepEqual(parseMutationParam('7.1.5.19.abc'), [1, 5, 7]);
  assert.deepEqual(parseMutationParam(null), []);
  assert.deepEqual(parseMutationParam(''), []);
  for (const ids of [[1], [2, 9, 13], PICKABLE_MUTATION_IDS]) {
    assert.deepEqual(parseMutationParam(encodeMutationParam(ids)), normalizeMutationIds(ids));
  }
});

test('no mutations leaves cache key, save folder and stats untouched', () => {
  assert.equal(mutationCacheSegment([]), '');
  assert.equal(mutationSavepathSuffix([]), '');
  assert.deepEqual(mutationFeatureKeys([]), []);
  assert.equal(mutationCacheSegment([1, 5, 7]), ':mut-v1:1.5.7');
  assert.equal(mutationSavepathSuffix([1, 5, 7]), '_m1-5-7');
  const KEY = /^[a-z0-9:-]{1,48}$/; // feature-stats key rule
  for (const k of mutationFeatureKeys(PICKABLE_MUTATION_IDS)) assert.match(k, KEY);
  // Different sets never share a key segment.
  assert.notEqual(mutationCacheSegment([1, 5]), mutationCacheSegment([1, 5, 7]));
  const base = makeCacheKey(42, 1, 0, [1, 2, 3, 4, 5], true, 'Corpsefire', false, false, true, 1, [1, 2, 3, 4, 5], [1, 2, 3], 0, false, false, true, false, false);
  assert.ok(!base.includes('mut-v1'));
});

test('conflict checks match EXCLUSIVE_MUTATION_PAIRS', () => {
  for (const [a, b] of EXCLUSIVE_MUTATION_PAIRS) {
    if (a === 19 || b === 19) continue;
    assert.equal(findMutationConflict(a, [b]), b);
    assert.equal(findMutationConflict(b, [a, 4]), a);
    assert.deepEqual(findConflictingPair([a, 4, b]), [a, b]);
    assert.match(validateMutations([a, b], {}), /can't be used together/);
  }
  assert.equal(findMutationConflict(4, [5, 7]), null);
  assert.equal(findConflictingPair([4, 5, 7]), null);
  assert.equal(validateMutations([4, 5, 7], {}), null);
});

test('option conflicts: House Always Wins vs quest shuffle, No Guard vs hand-placed defense skills', () => {
  assert.equal(mutationOptionConflict(9, {}), null);
  assert.match(mutationOptionConflict(9, { openActsShuffle: true }), /quest shuffle/);
  assert.equal(mutationOptionConflict(16, { buildSkills: ['Fire Bolt', 'Bone Armor'] }), null);
  assert.match(mutationOptionConflict(16, { buildSkills: ['Fire Bolt', 'Frozen Armor'] }), /Frozen Armor/);
  assert.equal(mutationOptionConflict(16, { openActsShuffle: true }), null);
  assert.match(validateMutations([4, 9], { openActsShuffle: true }), /House Always Wins/);
});

test('week-number wrappers match the id-based functions for every challenge', () => {
  const pre = () => ({ p: loadTxtFile('magicprefix.txt'), s: loadTxtFile('magicsuffix.txt') });
  for (let week = 0; week <= WEEKLY_MUTATIONS.length + 1; week++) {
    const ids = getMutationIds(week);
    assert.deepEqual([...orchestrator.getMutationExcludedSkills(week)], [...orchestrator.getMutationExcludedSkillsFor(ids)]);
    for (const slug of ['mystery-box', 'no-guard', 'forgotten-arts']) {
      assert.equal(orchestrator.isMutationActiveForWeek(week, slug), orchestrator.hasMutation(ids, slug));
    }
    if (ids.includes(2) || ids.includes(11)) {
      const a = pre(), b = pre();
      orchestrator.preApplyMagicAffixMutations(week, a.p, a.s);
      orchestrator.preApplyMagicAffixMutationsFor(ids, b.p, b.s);
      assert.deepEqual(a, b, `affix pre-hook, week ${week}`);
    }
  }
});

// ── Apply real combinations to data/txt ──────────────────────────────────────
const TABLES = {
  monstats: 'monstats', charstats: 'charstats', skills: 'skills', superuniques: 'superuniques',
  treasureclass: 'treasureclassex', experience: 'experience', armor: 'armor', weapons: 'weapons',
  misc: 'misc', uniqueitems: 'uniqueitems', magicprefix: 'magicprefix', magicsuffix: 'magicsuffix',
  levels: 'levels', hireling: 'hireling', monumod: 'monumod', monprop: 'monprop',
};
const base = Object.fromEntries(Object.entries(TABLES).map(([k, f]) => [k, loadTxtFile(`${f}.txt`)]));
const freshCtx = () => Object.fromEntries(Object.entries(base).map(([k, t]) => [k, { headers: [...t.headers], rows: t.rows.map(r => [...r]) }]));

/** Largest set with no exclusive pair (brute force over the pickable ids). */
function largestCompatibleSet() {
  const ids = PICKABLE_MUTATION_IDS;
  let best = [];
  for (let mask = 0; mask < 1 << ids.length; mask++) {
    const set = ids.filter((_, i) => mask & (1 << i));
    if (set.length > best.length && !findConflictingPair(set)) best = set;
  }
  return best;
}

test('the largest compatible set applies cleanly (no throw, no decimal cells)', () => {
  const set = largestCompatibleSet();
  assert.ok(set.length >= 12, `set size ${set.length}`);
  const ctx = freshCtx();
  orchestrator.applyMutations(set, ctx);
  // Spot checks that stacking really applied each mutation.
  const mh = ctx.monstats.headers;
  const changed = (table, col) => ctx[table].rows.some((r, i) => r[ctx[table].headers.indexOf(col)] !== base[table].rows[i][base[table].headers.indexOf(col)]);
  assert.ok(changed('monstats', 'Velocity') || changed('monstats', 'Run'), 'monster speed changed');
  assert.ok(mh.length === base.monstats.headers.length);
  assert.ok(changed('armor', 'durability') || changed('weapons', 'durability'), 'Entropy applied');
});

test('every allowed pair applies cleanly', () => {
  const ids = PICKABLE_MUTATION_IDS;
  let pairs = 0;
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const set = [ids[i], ids[j]];
      if (findConflictingPair(set)) {
        assert.throws(() => orchestrator.applyMutations(set, freshCtx()), /Conflicting mutations/);
        continue;
      }
      assert.doesNotThrow(() => orchestrator.applyMutations(set, freshCtx()), `pair ${set}`);
      pairs++;
    }
  }
  assert.ok(pairs > 100, `${pairs} pairs`);
});

// ── December 2026 (Krampusnacht): challenge-only Krampus Is Coming + Cold Snap ──
const graphicsBase = JSON.parse(fs.readFileSync(path.join(root, 'data/hd/character/monsters.json'), 'utf8').replace(/^\uFEFF/, ''));
const cell = (t, row, col) => row[t.headers.indexOf(col)];
const findRow = (t, key, col = t.headers[0]) => t.rows.find(r => cell(t, r, col) === key);

test('December lineup applies cleanly to the real tables', () => {
  const ctx = { ...freshCtx(), monsterGraphics: { ...graphicsBase } };
  orchestrator.applyMutations(getMutationIds(18), ctx);
  const { monstats: ms, superuniques: su, monumod: mu, skills: sk, treasureclass: tc } = ctx;

  // Krampus: four superuniques, each a balanced goat-demon with a goat-man escort.
  const krampus = load('src/lib/randomizer/mutations/krampus.ts');
  const tcNames = new Set(tc.rows.map(r => r[0]));
  for (const spawn of krampus.KRAMPUS_SPAWNS) {
    const row = findRow(su, spawn.superunique, 'Superunique');
    const id = krampus.krampusId(spawn.act);
    assert.equal(cell(su, row, 'Class'), id, spawn.superunique);
    assert.equal(cell(su, row, 'Name'), krampus.KRAMPUS_NAME_KEY);
    assert.deepEqual(['Mod1', 'Mod2', 'Mod3'].map(c => cell(su, row, c)), ['18', '7', '5']);
    for (const c of ['TC', 'TC(N)', 'TC(H)']) assert.ok(tcNames.has(cell(su, row, c)), `${spawn.superunique} ${c}`);
    for (const c of ['TC Desecrated', 'TC(N) Desecrated', 'TC(H) Desecrated']) {
      const v = cell(su, row, c);
      assert.ok(!v || tcNames.has(v), `${spawn.superunique} ${c} = ${v}`);
    }
    const m = findRow(ms, id);
    const vanillaClass = cell(base.superuniques, findRow(base.superuniques, spawn.superunique, 'Superunique'), 'Class');
    const dest = findRow(base.monstats, vanillaClass);
    assert.equal(cell(ms, m, 'BaseId'), 'goatman1');
    assert.equal(cell(ms, m, 'Level'), cell(base.monstats, dest, 'Level'), 'Normal level follows the spot');
    assert.equal(cell(ms, m, 'minion1'), krampus.krampusMinionId(spawn.act));
    assert.ok(findRow(ms, krampus.krampusMinionId(spawn.act)), 'minion row exists');
    assert.ok(ctx.monsterGraphics[id], 'HD token for Krampus');
    assert.ok(ctx.monsterGraphics[krampus.krampusMinionId(spawn.act)], 'HD token for his goat-men');
  }
  const hc = ms.rows.map(r => cell(ms, r, '*hcIdx')).filter(Boolean); // the Expansion divider is blank
  assert.equal(new Set(hc).size, hc.length, 'unique monstats hcIdx');

  // Cold Snap: Cold Enchanted wins unique and champion picks; every superunique has it.
  const cold = findRow(mu, '18', 'id');
  assert.equal(cell(mu, cold, 'uniquemod'), 'cold');
  assert.equal(cell(mu, cold, 'champion'), '1');
  for (const c of ['upick', 'upick (N)', 'upick (H)', 'cpick', 'cpick (N)', 'cpick (H)']) assert.equal(cell(mu, cold, c), '10000');
  for (const row of su.rows.filter(r => cell(su, r, 'Class'))) {
    assert.ok(['Mod1', 'Mod2', 'Mod3'].some(c => cell(su, row, c) === '18'), `${row[0]} is Cold Enchanted`);
  }
  // Cold pierce 10: every hostile monster, in every difficulty; summons and mercenaries left out.
  assert.deepEqual(sk.rows, base.skills.rows, 'skills.txt untouched');
  const skillCols = t => t.rows.map(r => Array.from({ length: 10 }, (_, i) => cell(t, r, `Skill ${i + 1}`)));
  assert.deepEqual(skillCols(ctx.charstats), skillCols(base.charstats), 'starting skills untouched');
  const mp = ctx.monprop;
  const pierces = row => ['', ' (N)', ' (H)'].every(d => Array.from({ length: 6 }, (_, i) => i + 1)
    .some(i => cell(mp, row, `prop${i}${d}`) === 'pierce-cold' && cell(mp, row, `chance${i}${d}`) === '100'
      && cell(mp, row, `min${i}${d}`) === '10' && cell(mp, row, `max${i}${d}`) === '10'));
  const summons = new Set(base.skills.rows.map(r => cell(base.skills, r, 'summon')).filter(Boolean));
  const skip = new Set([...summons, 'roguehire', 'act2hire', 'act3hire', 'act5hire1', 'act5hire2']);
  for (const row of ms.rows.filter(r => r[0] && r[0] !== 'Expansion')) {
    const prop = cell(ms, row, 'MonProp');
    if (skip.has(row[0])) {
      assert.equal(prop, cell(base.monstats, findRow(base.monstats, row[0]) ?? [], 'MonProp') ?? '', `${row[0]} keeps its MonProp`);
      continue;
    }
    const target = findRow(mp, prop);
    assert.ok(target && pierces(target), `${row[0]} pierces cold (MonProp ${prop})`);
  }
  // Existing rows keep their own properties (Blood Raven's knockback, the Council's extra fire).
  const vanillaRaven = findRow(base.monprop, 'bloodraven').filter(Boolean);
  const raven = findRow(mp, 'bloodraven');
  assert.ok(vanillaRaven.includes('knock') && vanillaRaven.every(v => raven.includes(v)), 'Blood Raven keeps her knockback');
  assert.ok(pierces(findRow(mp, 'councilmember1')));
  assert.ok(!pierces(findRow(mp, 'irongolem')), 'the Iron Golem (a summon) is left alone');
});

test('Krampus and Cold Snap each apply alone, and Krampus refuses a second pass', () => {
  for (const id of [20, 21]) {
    assert.doesNotThrow(() => orchestrator.applyMutations([id], { ...freshCtx(), monsterGraphics: { ...graphicsBase } }), `mutation ${id}`);
  }
  const ctx = { ...freshCtx(), monsterGraphics: { ...graphicsBase } };
  orchestrator.applyMutations([20], ctx);
  assert.throws(() => orchestrator.applyMutations([20], ctx), /applied twice/);
  const cold = freshCtx();
  orchestrator.applyMutations([21], cold);
  assert.throws(() => orchestrator.applyMutations([21], cold), /applied twice/);
});
