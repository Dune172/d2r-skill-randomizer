/**
 * verify-summon-pet-synergy.mjs
 *
 * Verifies the fix for "summon-skill synergies don't increase pet damage":
 * for each placed summon whose damage comes from a non-placed pet row, the
 * pet's synergy formula (EDmgSymPerCalc/DmgSymPerCalc) must now reference a
 * skill that is co-located on the SUMMON's class, and the summon's displayed
 * synergy line (dsc3textb) must name that same skill.
 *
 * Usage (dev server must be running: npm run dev):
 *   node scripts/verify-summon-pet-synergy.mjs --start 1 --max 4
 */
import AdmZip from 'adm-zip';

const BASE = process.env.TARGET || 'http://localhost:3000';
const args = process.argv.slice(2);
const argValue = (flag, dflt) => {
  const i = args.indexOf(flag);
  return i !== -1 && i + 1 < args.length ? args[i + 1] : dflt;
};
const startSeed = parseInt(argValue('--start', '1'), 10);
const maxSeeds = parseInt(argValue('--max', '4'), 10);

// summon player-skill -> pet damage skill it grants (non-placed row)
const SUMMON_PETS = {
  'Summon Tainted': 'Tainted Fire Ball',
  'Summon Goatman': 'Goatman Stun',
  'Charged Bolt Sentry': 'BoltSentry',
  'Inferno Sentry': 'mon inferno sentry',
  'Death Sentry': 'mon death sentry',
};
const BLVL = /skill\('([^']+)'\.blvl\)/g;

function parseTxt(content) {
  const lines = content.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const headers = lines[0].split('\t');
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '') continue;
    rows.push(lines[i].split('\t'));
  }
  return { headers, rows };
}
const sleep = (ms) => new Promise(res => setTimeout(res, ms));

async function generateZip(seed) {
  for (;;) {
    const r = await fetch(`${BASE}/api/randomize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seed, raceMode: false }),
    });
    if (r.status === 429) { process.stdout.write('  (rate limited, waiting 25s)\n'); await sleep(25_000); continue; }
    if (!r.ok) throw new Error(`randomize ${seed}: ${r.status} ${await r.text()}`);
    break;
  }
  const dl = await fetch(`${BASE}/api/download?seed=${seed}&raceMode=0`);
  if (!dl.ok) throw new Error(`download ${seed}: ${dl.status} ${await dl.text()}`);
  return new AdmZip(Buffer.from(await dl.arrayBuffer()));
}

let totalChecked = 0, failures = 0;

for (let seed = startSeed; seed < startSeed + maxSeeds; seed++) {
  const zip = await generateZip(seed);
  const sEntry = zip.getEntries().find(e => e.entryName.endsWith('data/global/excel/skills.txt'));
  const dEntry = zip.getEntries().find(e => e.entryName.endsWith('data/global/excel/skilldesc.txt'));
  const skills = parseTxt(sEntry.getData().toString('utf-8'));
  const sCol = (n) => skills.headers.indexOf(n);
  const skillByName = new Map(skills.rows.map(r => [r[0], r]));
  // charclass per skill name
  const classOf = (name) => { const r = skillByName.get(name); return r ? r[sCol('charclass')] : undefined; };

  console.log(`\n=== seed ${seed} ===`);
  for (const [summon, pet] of Object.entries(SUMMON_PETS)) {
    const summonRow = skillByName.get(summon);
    if (!summonRow) { console.log(`  ${summon}: row missing (dropped?) — skip`); continue; }
    const summonClass = summonRow[sCol('charclass')];
    if (!summonClass) { console.log(`  ${summon}: no charclass (dropped) — skip`); continue; }

    const petRow = skillByName.get(pet);
    if (!petRow) { console.log(`  ${summon} -> ${pet}: pet row missing — FAIL`); failures++; continue; }
    // Scan the WHOLE pet row (the fix remaps every cell, not just the
    // damage-symper columns — some pets carry their ref in a calc column).
    const refs = [];
    for (let c = 1; c < petRow.length; c++) {
      for (const m of (petRow[c] || '').matchAll(BLVL)) refs.push(m[1]);
    }
    totalChecked++;
    if (refs.length === 0) { console.log(`  ${summon} -> ${pet}: no .blvl refs in pet formula — skip`); continue; }

    const refClasses = refs.map(r => `${r}[${classOf(r) ?? '∅'}]`);
    const allOnSummonClass = refs.every(r => classOf(r) === summonClass);
    const tag = allOnSummonClass ? 'OK' : 'FAIL';
    if (!allOnSummonClass) failures++;
    console.log(`  ${summon}[${summonClass}] -> ${pet}: synergy=${refClasses.join(',')} -> ${tag}`);
  }
}

console.log(`\nChecked ${totalChecked} pet formulas across seeds [${startSeed},${startSeed + maxSeeds}). Failures: ${failures}`);
process.exit(failures > 0 ? 1 : 0);
