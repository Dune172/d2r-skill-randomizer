/**
 * verify-summon-pet-synergy.mjs
 *
 * Checks three synergy invariants across generated seeds:
 *
 *  1. Summon pets: for each placed summon whose damage comes from a non-placed
 *     pet row, every level ref in the pet's formula must name a skill
 *     co-located on the SUMMON's class.
 *  2. skilldesc calcs: every level ref in a placed skill's skilldesc.txt row
 *     must name a skill on that skill's own class. skilldesc carries its own
 *     copy of many damage formulas, and a stale ref there means the tooltip
 *     computes off a skill the player can no longer reach (level 0).
 *  3. dsc3textb naming: every synergy line names a skill that actually appears
 *     in that same row's calcs, so the listed name drives the listed number.
 *
 * Level refs are `.blvl` and `.lvl`. Coefficient refs (`.parN`, `.lnNN`,
 * `.dmNN`, …) are intentionally NOT remapped and are ignored here.
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
// Level refs — the ones the randomizer remaps. Must stay in sync with
// SYNERGY_REGEX in src/lib/randomizer/synergy-updater.ts.
const LEVEL_REF = /skill\('([^']+)'\.(?:blvl|lvl)\)/g;

/** Collect every level-ref skill name in a row (skips col 0, the identity). */
function levelRefsIn(row) {
  const refs = [];
  for (let c = 1; c < row.length; c++) {
    for (const m of (row[c] || '').matchAll(LEVEL_REF)) refs.push(m[1]);
  }
  return refs;
}

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
let descChecked = 0, descFailures = 0;
let nameChecked = 0, nameFailures = 0;

for (let seed = startSeed; seed < startSeed + maxSeeds; seed++) {
  const zip = await generateZip(seed);
  const sEntry = zip.getEntries().find(e => e.entryName.endsWith('data/global/excel/skills.txt'));
  const dEntry = zip.getEntries().find(e => e.entryName.endsWith('data/global/excel/skilldesc.txt'));
  const skills = parseTxt(sEntry.getData().toString('utf-8'));
  const descs = parseTxt(dEntry.getData().toString('utf-8'));
  const sCol = (n) => skills.headers.indexOf(n);
  const dCol = (n) => descs.headers.indexOf(n);
  const skillByName = new Map(skills.rows.map(r => [r[0], r]));
  const descByName = new Map(descs.rows.map(r => [r[0], r]));
  // charclass per skill name
  const classOf = (name) => { const r = skillByName.get(name); return r ? r[sCol('charclass')] : undefined; };

  console.log(`\n=== seed ${seed} ===`);

  // --- 1. summon pet formulas -------------------------------------------
  for (const [summon, pet] of Object.entries(SUMMON_PETS)) {
    const summonRow = skillByName.get(summon);
    if (!summonRow) { console.log(`  ${summon}: row missing (dropped?) — skip`); continue; }
    const summonClass = summonRow[sCol('charclass')];
    if (!summonClass) { console.log(`  ${summon}: no charclass (dropped) — skip`); continue; }

    const petRow = skillByName.get(pet);
    if (!petRow) { console.log(`  ${summon} -> ${pet}: pet row missing — FAIL`); failures++; continue; }
    // Scan the WHOLE pet row (the fix remaps every cell, not just the
    // damage-symper columns — some pets carry their ref in a calc column).
    const refs = levelRefsIn(petRow);
    totalChecked++;
    if (refs.length === 0) { console.log(`  ${summon} -> ${pet}: no level refs in pet formula — skip`); continue; }

    const refClasses = refs.map(r => `${r}[${classOf(r) ?? '∅'}]`);
    const allOnSummonClass = refs.every(r => classOf(r) === summonClass);
    const tag = allOnSummonClass ? 'OK' : 'FAIL';
    if (!allOnSummonClass) failures++;
    console.log(`  ${summon}[${summonClass}] -> ${pet}: synergy=${refClasses.join(',')} -> ${tag}`);
  }

  // --- 2. skilldesc calc refs land on the skill's own class --------------
  // --- 3. dsc3textb names a skill that drives one of this row's calcs ----
  //
  // Resolve skill -> str name (forward). The reverse direction is ambiguous:
  // substitution copies a source row's columns (including `str name`) onto the
  // dropped skill's skilldesc row, so one str name can appear on two rows.
  const strNameOfSkill = (skillName) => {
    const r = skillByName.get(skillName);
    const d = r ? descByName.get(r[sCol('skilldesc')]) : undefined;
    return d ? d[dCol('str name')] : undefined;
  };

  const descOffenders = [];
  const nameOffenders = [];

  for (const skillRow of skills.rows) {
    const cls = skillRow[sCol('charclass')];
    if (!cls) continue; // not a placed player skill
    const descName = skillRow[sCol('skilldesc')];
    const descRow = descName ? descByName.get(descName) : undefined;
    if (!descRow) continue;

    const descRefs = levelRefsIn(descRow);
    if (descRefs.length > 0) {
      descChecked++;
      const bad = descRefs.filter(r => classOf(r) !== cls);
      if (bad.length > 0) {
        descFailures++;
        descOffenders.push(`${skillRow[0]}[${cls}] desc refs off-class: ${bad.map(b => `${b}[${classOf(b) ?? '∅'}]`).join(',')}`);
      }
    }

    // Every synergy line should name a skill referenced by this row's calcs.
    // Compare str names, not skill names — that's what the slot actually holds.
    const allRefs = new Set([...descRefs, ...levelRefsIn(skillRow)]);
    if (allRefs.size === 0) continue;
    const expected = new Set();
    for (const r of allRefs) {
      const sn = strNameOfSkill(r);
      if (sn) expected.add(sn);
    }
    // A row may declare more synergy lines than it has level refs — vanilla
    // does this for Meteor, Immolation Arrow, Fist of the Heavens and the
    // Druid summons, whose real coefficients come from `.parN`/`.lnNN` lookups
    // that are deliberately not remapped. Those surplus slots get a random
    // classmate and can't be backed by a calc, so allow exactly that many.
    let slots = 0, unbacked = 0;
    const rowOffenders = [];
    for (let i = 1; i <= 7; i++) {
      const lineIdx = dCol(`dsc3line${i}`);
      const tbIdx = dCol(`dsc3textb${i}`);
      if (tbIdx < 0 || !descRow[tbIdx]) continue;
      if (lineIdx >= 0 && descRow[lineIdx] === '40') continue; // header
      slots++;
      nameChecked++;
      if (!expected.has(descRow[tbIdx])) {
        unbacked++;
        rowOffenders.push(`${skillRow[0]}[${cls}] dsc3textb${i}=${descRow[tbIdx]} not among calc refs {${[...allRefs].join(',')}}`);
      }
    }
    const allowed = Math.max(0, slots - expected.size);
    if (unbacked > allowed) {
      nameFailures += unbacked - allowed;
      nameOffenders.push(...rowOffenders.slice(allowed));
    }
  }

  console.log(`  skilldesc calc refs: ${descChecked} checked, ${descOffenders.length} bad this seed`);
  for (const o of descOffenders.slice(0, 8)) console.log(`    ${o}`);
  console.log(`  dsc3textb naming:    ${nameChecked} checked, ${nameOffenders.length} bad this seed`);
  for (const o of nameOffenders.slice(0, 8)) console.log(`    ${o}`);
}

console.log(`\nPet formulas:      ${totalChecked} checked, ${failures} failures`);
console.log(`skilldesc refs:    ${descChecked} checked, ${descFailures} failures`);
console.log(`dsc3textb naming:  ${nameChecked} checked, ${nameFailures} failures`);
const total = failures + descFailures + nameFailures;
console.log(`\nseeds [${startSeed},${startSeed + maxSeeds}). Total failures: ${total}`);
process.exit(total > 0 ? 1 : 0);
