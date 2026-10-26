// TEST-ONLY "arena" mod for the Open Acts spike. Puts every mechanism within reach of a
// level-1 character so Claude can verify them by driving the game:
//   - all monsters: 1 HP, 0 defense, 0 damage; every kill also drops qey, qbr, leg
//     (misc spawnable=0, misc made spawnable=1, weapon) through a guaranteed-drop TC wrapper
//   - stand-in hosts near town: outdoor chests -> 41 (Staff of Kings),
//     large chests (Mode1=0, like the Malus) -> 57 (Khalim's Heart),
//     rogue corpses / burned bodies -> 12 (Inifuss scroll)
//   - real hosts: Malus -> 39 (Cube), InifussTree -> 28 (Lam Esen's Tome),
//     Wirt's body -> 40 (Horadric Scroll chest handler); Griswold drops qf1 (Khalim's Flail)
//   - Den of Evil quest-log line carries a hint
// No two sources hand out the same item, because quest handlers skip a player who
// already holds theirs.
// Usage: node build-arena.mjs <repoRoot> <questsJsonPath> <modsDir>
import fs from 'fs';
import path from 'path';

const [repo, questsPath, modsDir] = process.argv.slice(2);
const MOD = 'd2rr_openacts_arena';
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

const tc = load('treasureclassex.txt');
const wrappers = new Map();
function wrap(original, codes, tag) {
  if (!original) return original;
  const key = `ARENA_${tag}_${wrappers.size}`;
  const cacheKey = `${tag}|${original}`;
  if (wrappers.has(cacheKey)) return wrappers.get(cacheKey);
  const w = new Array(tc.headers.length).fill('');
  const fields = { 'Treasure Class': key, Picks: String(-(codes.length + 1)), NoDrop: '0', '*eol': '0' };
  codes.forEach((c, i) => { fields[`Item${i + 1}`] = c; fields[`Prob${i + 1}`] = '1'; });
  fields[`Item${codes.length + 1}`] = original;
  fields[`Prob${codes.length + 1}`] = '1';
  for (const [f, v] of Object.entries(fields)) w[tc.col(f)] = v;
  tc.rows.push(w);
  wrappers.set(cacheKey, key);
  return key;
}

// ── monsters: harmless, one hit, and drop the TC test items ────────────────
const mon = load('monstats.txt');
const hpCols = ['minHP', 'maxHP', 'MinHP(N)', 'MaxHP(N)', 'MinHP(H)', 'MaxHP(H)'];
const acCols = ['AC', 'AC(N)', 'AC(H)'];
const dmgCols = mon.headers.filter(h => /^(A1|A2|S1|El1|El2|El3)M(in|ax)D/.test(h) || /^(A1|A2|S1|El1|El2|El3)M(in|ax)D\((N|H)\)$/.test(h));
const tcCols = mon.headers.filter(h => /^TreasureClass/.test(h));
for (const r of mon.rows) {
  if (!r[mon.col('Id')] || r[mon.col('Id')] === 'Expansion') continue;
  for (const c of hpCols) if (r[mon.col(c)] !== '') r[mon.col(c)] = '1';
  for (const c of acCols) if (r[mon.col(c)] !== '') r[mon.col(c)] = '0';
  for (const c of dmgCols) if (r[mon.col(c)] !== '') r[mon.col(c)] = '0';
  for (const c of tcCols) r[mon.col(c)] = wrap(r[mon.col(c)], ['qey', 'qbr', 'leg'], 'MON');
}

// ── Griswold: Khalim's Flail through his superunique TC columns ────────────
const su = load('superuniques.txt');
const gris = row(su, 'Superunique', 'Griswold');
for (const c of ['TC', 'TC Desecrated', 'TC(N)', 'TC(N) Desecrated', 'TC(H)', 'TC(H) Desecrated']) {
  gris[su.col(c)] = wrap(gris[su.col(c)], ['qf1'], 'GRIS');
}

// ── misc.txt: Khalim's Brain spawnable=1 (does spawnable gate TC drops?) ───
const misc = load('misc.txt');
row(misc, 'code', 'qbr')[misc.col('spawnable')] = '1';

// ── objects.txt: handler hosts ─────────────────────────────────────────────
const objects = load('objects.txt');
const setFn = (cls, fn) => { row(objects, 'Class', cls)[objects.col('OperateFn')] = fn; };
for (const c of ['ChestOutdoor1', 'ChestOutdoor2', 'ChestOutdoor3', 'ChestOutdoor4', 'Chest2', 'Chest3', 'Chest4']) setFn(c, '41');
for (const c of ['LargeChestR', 'LargeChestL']) setFn(c, '57');
for (const c of ['RogueCorpse1', 'RogueCorpse2', 'RogueRollingCorpse1', 'RogueStakedCorpse1', 'RogueStakedCorpse2', 'BurnedBody1Act1']) setFn(c, '12');
setFn('Malus', '39');
setFn('InifussTree', '28');
setFn('Wirt', '40');

// ── quests.json: hint on the Den of Evil line ──────────────────────────────
const quests = JSON.parse(fs.readFileSync(questsPath, 'utf8').replace(/^﻿/, ''));
quests.find(e => e.Key === 'qstsa1q11').enUS =
  "Look for the Den in the wilderness outside the Rogues' Camp.\nHINT: Khalim's Eye is somewhere in Act I.";

// ── write ──────────────────────────────────────────────────────────────────
const mpq = path.join(modsDir, MOD, `${MOD}.mpq`);
const excel = path.join(mpq, 'data', 'global', 'excel');
const strings = path.join(mpq, 'data', 'local', 'lng', 'strings');
fs.mkdirSync(excel, { recursive: true });
fs.mkdirSync(strings, { recursive: true });
for (const t of [objects, su, tc, misc, mon]) save(t, excel);
fs.writeFileSync(path.join(strings, 'quests.json'), JSON.stringify(quests, null, 2), 'utf8');
fs.writeFileSync(path.join(mpq, 'modinfo.json'), JSON.stringify({ name: MOD, savepath: SAVEPATH }));
console.log(`wrote ${mpq}: ${wrappers.size} TC wrappers, ${dmgCols.length} damage columns zeroed`);
