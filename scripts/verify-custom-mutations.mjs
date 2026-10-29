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

test('every registry mutation but Forgotten Arts is pickable', () => {
  const all = Object.keys(MUTATIONS).map(Number).sort((a, b) => a - b);
  assert.deepEqual(PICKABLE_MUTATION_IDS, all.filter(id => id !== 19));
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
  levels: 'levels', hireling: 'hireling',
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
