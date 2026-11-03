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
