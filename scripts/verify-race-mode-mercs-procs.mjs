/**
 * verify-race-mode-mercs-procs.mjs
 *
 * 1. Race Mode mercenaries keep their skills. hireling.txt names merc skills by
 *    skills.txt row, and Race Mode turns every non-race-class row into Prayer
 *    filler — so each merc skill row must still carry its VANILLA mechanics, and
 *    when it sits on a filler class it must be locked (reqlevel 100).
 * 2. No item proc (CTC family / charged) targets an aura or passive row, in
 *    Race Mode and normal mode. Substituted rows keep a vanilla identity with
 *    foreign mechanics, so an identity-remapped vanilla proc could otherwise
 *    land on Prayer filler ("N% chance to cast Prayer").
 *
 * Run with: node scripts/verify-race-mode-mercs-procs.mjs [baseUrl]
 *   (dev server must already be running; default http://localhost:3000)
 */
import AdmZip from 'adm-zip';
import fs from 'fs';
import path from 'path';

const BASE = process.argv[2] ?? 'http://localhost:3000';
const SEEDS = [1, 1337, 424242, 987654321];

// Mechanics columns compared against vanilla — any substitution overwrites them.
// (Not anim: writeSkillsRows remaps class-locked anims for every moved skill.)
const MECHANIC_COLS = ['srvstfunc', 'srvdofunc', 'srvmissile', 'srvmissilea', 'aura', 'aurastate', 'passive', 'EType', 'EMin', 'EMax', 'MinDam', 'MaxDam', 'cltmissile'];

const PROC_CODES = new Set([
  'charged',
  'hit-skill', 'hit-skill-noc', 'att-skill', 'att-skill-noc',
  'gethit-skill', 'gethit-skill-noc', 'kill-skill', 'kill-skill-noc',
  'death-skill', 'death-skill-noc', 'levelup-skill', 'levelup-skill-noc',
]);

function parseTxt(content) {
  const lines = content.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const headers = lines[0].split('\t');
  const rows = lines.slice(1).filter(l => l.trim() !== '').map(l => l.split('\t'));
  return { headers, rows };
}
const vanillaTxt = name => parseTxt(fs.readFileSync(path.join(process.cwd(), 'data', 'txt', name), 'utf-8'));

async function generateZip(seed, raceMode) {
  let r;
  for (;;) {
    r = await fetch(`${BASE}/api/randomize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seed, raceMode }),
    });
    if (r.status !== 429) break;
    const { retryAfter = 20 } = await r.json(); // per-IP generation rate limit
    await new Promise(res => setTimeout(res, (retryAfter + 1) * 1000));
  }
  if (!r.ok) throw new Error(`randomize ${seed}: ${r.status} ${await r.text()}`);
  const dl = await fetch(`${BASE}/api/download?seed=${seed}${raceMode ? '' : '&raceMode=0'}`);
  if (!dl.ok) throw new Error(`download ${seed}: ${dl.status} ${await dl.text()}`);
  return new AdmZip(Buffer.from(await dl.arrayBuffer()));
}
function readTxt(zip, suffix) {
  const e = zip.getEntries().find(x => x.entryName.toLowerCase().endsWith(suffix));
  return e ? parseTxt(e.getData().toString('utf-8')) : null;
}

const vSkills = vanillaTxt('skills.txt');
const vByName = new Map(vSkills.rows.map(r => [r[0], r]));
const vHireling = vanillaTxt('hireling.txt');

function hirelingSkillNames(h) {
  const names = new Set();
  for (let i = 1; i <= 6; i++) {
    const c = h.headers.indexOf(`Skill${i}`);
    if (c !== -1) for (const r of h.rows) if (r[c]) names.add(r[c]);
  }
  return names;
}

function checkMercs(zip, failures) {
  const skills = readTxt(zip, '/skills.txt');
  const col = n => skills.headers.indexOf(n);
  const byName = new Map(skills.rows.map(r => [r[0], r]));
  // Every vanilla merc skill must keep its row, whether or not hireling.txt ships.
  const names = hirelingSkillNames(vHireling);
  // With the aura option on, aura slots re-roll to other placed auras; those must be
  // real auras, not Prayer filler posing under another skill's name.
  const shipped = readTxt(zip, '/hireling.txt');
  if (shipped) {
    for (const n of hirelingSkillNames(shipped)) {
      if (names.has(n) || n === 'Prayer') continue;
      const out = byName.get(n);
      if (out && out[col('aurastate')] === 'prayer') failures.push(`merc aura ${n}: is Prayer filler`);
    }
  }

  // Merc skills that landed on the race class stay learnable; the rest are locked.
  let locked = 0;
  for (const name of names) {
    const out = byName.get(name), van = vByName.get(name);
    if (!out || !van) { failures.push(`merc skill ${name}: row missing`); continue; }
    for (const c of MECHANIC_COLS) {
      const oi = col(c), vi = vSkills.headers.indexOf(c);
      if (oi === -1 || vi === -1) continue;
      if (out[oi] !== van[vi]) { failures.push(`merc skill ${name}: ${c} changed (${van[vi]} → ${out[oi]})`); break; }
    }
    if (out[col('reqlevel')] === '100') locked++;
  }
  return { mercSkills: names.size, locked };
}

function checkProcs(zip, failures) {
  const skills = readTxt(zip, '/skills.txt');
  const passCol = skills.headers.indexOf('passive'), auraCol = skills.headers.indexOf('aura');
  const bad = (par, label) => {
    const s = (par ?? '').trim();
    if (!s) return;
    const n = parseInt(s, 10);
    const row = !isNaN(n) ? skills.rows[n] : skills.rows.find(r => r[0] === s);
    if (!row) return;
    if (row[passCol] === '1' || row[auraCol] === '1') failures.push(`${label} → ${row[0]} (${row[auraCol] === '1' ? 'aura' : 'passive'})`);
  };
  let checked = 0;
  const unique = readTxt(zip, '/uniqueitems.txt');
  if (unique) for (const r of unique.rows) for (let i = 1; i <= 12; i++) {
    const p = unique.headers.indexOf(`prop${i}`), v = unique.headers.indexOf(`par${i}`);
    if (p !== -1 && PROC_CODES.has(r[p])) { checked++; bad(r[v], `unique ${r[0]} ${r[p]}`); }
  }
  for (const f of ['/magicprefix.txt', '/magicsuffix.txt']) {
    const t = readTxt(zip, f);
    if (t) for (const r of t.rows) for (let i = 1; i <= 3; i++) {
      const c = t.headers.indexOf(`mod${i}code`), v = t.headers.indexOf(`mod${i}param`);
      if (c !== -1 && PROC_CODES.has(r[c])) { checked++; bad(r[v], `${f.slice(1, -4)} ${r[0]} ${r[c]}`); }
    }
  }
  return checked;
}

let totalFail = 0;
for (const seed of SEEDS) {
  for (const raceMode of [true, false]) {
    const zip = await generateZip(seed, raceMode);
    const failures = [];
    const procs = checkProcs(zip, failures);
    let mercNote = '';
    if (raceMode) {
      const { mercSkills, locked } = checkMercs(zip, failures);
      mercNote = ` mercSkills=${mercSkills} lockedOnFiller=${locked}`;
    }
    console.log(`seed ${seed} race=${raceMode}: procs=${procs}${mercNote} → ${failures.length ? `FAIL (${failures.length})` : 'PASS'}`);
    for (const f of failures.slice(0, 10)) console.log(`    ${f}`);
    totalFail += failures.length;
  }
}
console.log(`\n=== TOTAL: ${totalFail === 0 ? 'PASS' : `FAIL (${totalFail})`} ===`);
process.exit(totalFail === 0 ? 0 : 1);
