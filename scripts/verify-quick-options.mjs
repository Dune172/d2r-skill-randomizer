/**
 * verify-quick-options.mjs — unit checks for the v0.338 option helpers:
 * skill points per level (src/lib/skill-points.ts) and the custom shortcut's install
 * folder (src/lib/install-dir.ts). Both files have no imports, so Node loads them
 * directly with its built-in type stripping (Node 22.6+).
 *
 *   node --test scripts/verify-quick-options.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeSkillPoints, parseSkillPoints, skillPointsParam, skillPointsCacheSegment, applySkillPoints,
} from '../src/lib/skill-points.ts';
import { normalizeInstallDir } from '../src/lib/install-dir.ts';
import {
  normalizeShuffleAmount, parseShuffleAmount, shuffleAmountParam, shuffleAmountCacheSegment, shuffleShareOf,
} from '../src/lib/shuffle-amount.ts';
import {
  DEFAULT_MOD_EXTRAS, normalizeModExtras, modExtrasFromParams, modExtrasParams, modExtrasCacheSegment, openClassItems,
} from '../src/lib/mod-extras.ts';
import fs from 'node:fs';

test('skill points clamp to 1–3 and junk is vanilla', () => {
  for (const [input, want] of [[1, 1], [2, 2], [3, 3], [4, 3], [0, 1], [-2, 1], ['2', 2], [2.9, 2], ['x', 1], [undefined, 1], [null, 1], [NaN, 1], [Infinity, 1]]) {
    assert.equal(normalizeSkillPoints(input), want, `normalizeSkillPoints(${input})`);
  }
  assert.equal(parseSkillPoints(null), 1);
  assert.equal(parseSkillPoints('3'), 3);
  assert.equal(parseSkillPoints(''), 1);
});

test('vanilla skill points add nothing to links or cache keys', () => {
  assert.equal(skillPointsParam(1), '');
  assert.equal(skillPointsCacheSegment(1), '');
  assert.equal(skillPointsParam(2), 'skillPoints=2');
  assert.equal(skillPointsCacheSegment(3), ':spl3');
});

test('applySkillPoints sets every class row and skips the Expansion row', () => {
  const headers = ['class', 'str', 'SkillsPerLevel'];
  const rows = [['Amazon', '20', '1'], ['Expansion', '', ''], ['Warlock', '15', '1'], ['', '', '']];
  applySkillPoints(headers, rows, 1);
  assert.deepEqual(rows.map(r => r[2]), ['1', '', '1', '']);
  applySkillPoints(headers, rows, 3);
  assert.deepEqual(rows.map(r => r[2]), ['3', '', '3', '']);
  assert.throws(() => applySkillPoints(['class'], [['Amazon']], 2), /SkillsPerLevel/);
});

test('install folders are cleaned up or rejected', () => {
  const ok = {
    'D:\\Games\\Diablo II Resurrected': 'D:\\Games\\Diablo II Resurrected',
    'D:\\Games\\Diablo II Resurrected\\': 'D:\\Games\\Diablo II Resurrected',
    '  "D:\\Games\\Diablo II Resurrected\\D2R.exe"  ': 'D:\\Games\\Diablo II Resurrected',
    'e:/Spiele/Diablo II Résurrected/d2r.EXE': 'e:\\Spiele\\Diablo II Résurrected',
    'D:\\': 'D:\\',
    'D:': 'D:\\',
  };
  for (const [input, want] of Object.entries(ok)) assert.equal(normalizeInstallDir(input), want, input);
  for (const bad of ['', 'Games', '\\\\server\\share\\D2R', 'D:\\a<b', 'D:\\a"b', 'D:\\a|b', 'D:\\a:b', 'D:\\a\u0001b', 'DD:\\x', `D:\\${'x'.repeat(300)}`]) {
    assert.equal(normalizeInstallDir(bad), null, JSON.stringify(bad));
  }
});

test('shuffle amount: only 50 and 25 are partial, and 100 adds nothing', () => {
  for (const [input, want] of [[100, 100], [50, 50], [25, 25], ['50', 50], [75, 100], [0, 100], ['x', 100], [undefined, 100], [null, 100]]) {
    assert.equal(normalizeShuffleAmount(input), want, `normalizeShuffleAmount(${input})`);
  }
  assert.equal(parseShuffleAmount(null), 100);
  assert.equal(parseShuffleAmount('25'), 25);
  assert.equal(shuffleAmountParam(100), '');
  assert.equal(shuffleAmountCacheSegment(100), '');
  assert.equal(shuffleShareOf(100), undefined);
  assert.equal(shuffleAmountParam(50), 'shuffle=50');
  assert.equal(shuffleAmountCacheSegment(25), ':shuf25');
  assert.equal(shuffleShareOf(25), 0.25);
});

test('mod extras: defaults add nothing, and params round-trip', () => {
  assert.deepEqual(normalizeModExtras({}), DEFAULT_MOD_EXTRAS);
  assert.deepEqual(normalizeModExtras(undefined), DEFAULT_MOD_EXTRAS);
  assert.deepEqual(normalizeModExtras({ seasonal: 'no', anyClassItems: 'yes' }), DEFAULT_MOD_EXTRAS);
  assert.deepEqual(modExtrasParams(DEFAULT_MOD_EXTRAS), []);
  assert.equal(modExtrasCacheSegment(DEFAULT_MOD_EXTRAS), '');
  for (const e of [{ seasonal: false, anyClassItems: false }, { seasonal: true, anyClassItems: true }, { seasonal: false, anyClassItems: true }]) {
    const q = new URLSearchParams(modExtrasParams(e).join('&'));
    assert.deepEqual(modExtrasFromParams(n => q.get(n)), e);
    assert.notEqual(modExtrasCacheSegment(e), '');
  }
});

test('openClassItems frees every class item type except claws, and nothing else', () => {
  const vanilla = fs.readFileSync(new URL('../data/txt/itemtypes.txt', import.meta.url), 'utf8');
  const out = openClassItems(vanilla);
  assert.equal(out.includes('\r\n'), vanilla.includes('\r\n'), 'line endings kept');
  const parse = txt => {
    const [head, ...rows] = txt.split(/\r?\n/).filter(Boolean).map(l => l.split('\t'));
    const code = head.indexOf('Code'), cls = head.indexOf('Class');
    return new Map(rows.map(r => [r[code], r[cls] ?? '']));
  };
  const before = parse(vanilla), after = parse(out);
  assert.equal(after.size, before.size);
  for (const [code, cls] of before) {
    if (code === 'h2h' || code === 'h2h2') assert.equal(after.get(code), 'ass', code);
    else assert.equal(after.get(code), '', `${code} was ${cls}`);
  }
  // Only the Class column changed.
  const strip = txt => txt.split(/\r?\n/).map(l => { const c = l.split('\t'); c[26] = ''; return c.join('\t'); }).join('\n');
  assert.equal(strip(out), strip(vanilla));
  for (const code of ['orb', 'head', 'ashd', 'phlm', 'pelt', 'abow', 'aspe', 'ajav', 'cloa', 'grim']) {
    assert.ok(before.get(code), `${code} is class-only in vanilla`);
  }
});
