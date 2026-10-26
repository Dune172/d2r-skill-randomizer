// Spike E for Open Acts: boss drops of quest items, object handler swaps,
// a quest-log hint, and (separately) the all-difficulty starter save.
// Usage: node build-open-acts-e.mjs <repoRoot> <questsJsonPath> <modsDir>
import fs from 'fs';
import path from 'path';

const [repo, questsPath, modsDir] = process.argv.slice(2);
const MOD = 'd2rr_openacts_e';
const SAVEPATH = 'd2rr_openacts_test';
const txtDir = path.join(repo, 'data', 'txt');

function load(name) {
  const raw = fs.readFileSync(path.join(txtDir, name), 'latin1');
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const lines = raw.split(eol);
  const trailing = lines[lines.length - 1] === '' ? lines.pop() : null;
  const headers = lines[0].split('\t');
  const rows = lines.slice(1).map(l => l.split('\t'));
  return { name, eol, trailing, headers, rows, col: h => {
    const i = headers.indexOf(h); if (i < 0) throw new Error(`${name}: no column ${h}`); return i;
  } };
}
function save(t, outDir) {
  const body = [t.headers.join('\t'), ...t.rows.map(r => r.join('\t'))].join(t.eol) + (t.trailing !== null ? t.eol : '');
  fs.writeFileSync(path.join(outDir, t.name), body, 'latin1');
}
function row(t, keyCol, key) {
  const r = t.rows.find(x => x[t.col(keyCol)] === key);
  if (!r) throw new Error(`${t.name}: no row ${key}`);
  return r;
}

// ── objects.txt: handler swaps ─────────────────────────────────────────────
const objects = load('objects.txt');
const swaps = { InifussTree: '41', Malus: '58', HoradricCubeChest: '12' };
for (const [cls, fn] of Object.entries(swaps)) row(objects, 'Class', cls)[objects.col('OperateFn')] = fn;

// ── superuniques + treasureclassex: guaranteed quest-item drops ────────────
const su = load('superuniques.txt');
const tc = load('treasureclassex.txt');
const drops = { Corpsefire: 'qey', Bishibosh: 'msf', Rakanishu: 'qbr' };
const tcCols = ['TC', 'TC Desecrated', 'TC(N)', 'TC(N) Desecrated', 'TC(H)', 'TC(H) Desecrated'];
for (const [boss, code] of Object.entries(drops)) {
  const r = row(su, 'Superunique', boss);
  for (const c of tcCols) {
    const original = r[su.col(c)];
    if (!original) continue;
    const key = `OA_${boss}_${c.replace(/[^A-Za-z]/g, '')}`;
    const w = new Array(tc.headers.length).fill('');
    for (const [f, v] of Object.entries({ 'Treasure Class': key, Picks: '-2', NoDrop: '0',
      Item1: code, Prob1: '1', Item2: original, Prob2: '1', '*eol': '0' })) w[tc.col(f)] = v;
    tc.rows.push(w);
    r[su.col(c)] = key;
  }
}

// ── misc.txt: Khalim's Brain spawnable=1 (to tell whether spawnable matters) ─
const misc = load('misc.txt');
row(misc, 'code', 'qbr')[misc.col('spawnable')] = '1';

// ── quests.json: hint on the Den of Evil line ──────────────────────────────
const quests = JSON.parse(fs.readFileSync(questsPath, 'utf8').replace(/^﻿/, ''));
const den = quests.find(e => e.Key === 'qstsa1q11');
den.enUS = "Look for the Den in the wilderness outside the Rogues' Camp.\nHINT: Khalim's Eye is somewhere in Act I.";

// ── write the mod ──────────────────────────────────────────────────────────
const mpq = path.join(modsDir, MOD, `${MOD}.mpq`);
const excel = path.join(mpq, 'data', 'global', 'excel');
const strings = path.join(mpq, 'data', 'local', 'lng', 'strings');
fs.mkdirSync(excel, { recursive: true });
fs.mkdirSync(strings, { recursive: true });
for (const t of [objects, su, tc, misc]) save(t, excel);
fs.writeFileSync(path.join(strings, 'quests.json'), JSON.stringify(quests, null, 2), 'utf8');
fs.writeFileSync(path.join(mpq, 'modinfo.json'), JSON.stringify({ name: MOD, savepath: SAVEPATH }));
console.log(`wrote ${mpq}`);
