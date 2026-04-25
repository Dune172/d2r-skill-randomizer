/**
 * diagnose-fury.mjs
 *
 * Verifies the v0.222 fix for Fury (and Shock Wave) animation on non-Druid
 * form-host classes. Both are pinned to Druid via HARDCODED_CLASS_SKILLS, and
 * additionally are conditionally dropped if their form anchor (Wearwolf for
 * Fury, Wearbear for Shock Wave) didn't land on Druid via the shuffle.
 *
 * For each seed, asserts:
 *   1. Fury, when KEPT (restrict=2 + vanilla cltdofunc=21), is on Druid AND
 *      Wearwolf is on Druid. If Wearwolf is elsewhere, Fury must be a
 *      substitute (different cltdofunc/srvdofunc).
 *   2. Same for Shock Wave + Wearbear (vanilla cltdofunc=17).
 *   3. Fury and Shock Wave never appear on a non-Druid class.
 *
 * Run with: node scripts/diagnose-fury.mjs
 *   (dev server must already be running: `npm run dev`)
 */
import AdmZip from 'adm-zip';
import fs from 'fs';
import path from 'path';

const BASE = 'http://localhost:3000';
// Allow seed range override: node scripts/diagnose-fury.mjs [start] [count]
const SEED_START = Number(process.argv[2]) || 1;
const N = Number(process.argv[3]) || 30;
const DATA_DIR = path.join(process.cwd(), 'data', 'txt');

const GATED = [
  { skill: 'Fury', anchor: 'Wearwolf', vanillaCltdofunc: '21', vanillaSrvdofunc: '13' },
  { skill: 'Shock Wave', anchor: 'Wearbear', vanillaCltdofunc: '17', vanillaSrvdofunc: '8' },
];

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

function colIdx(parsed, name) { return parsed.headers.indexOf(name); }

function getRow(parsed, skillName) {
  return parsed.rows.find(r => r[0] === skillName);
}

function loadVanilla() {
  return parseTxt(fs.readFileSync(path.join(DATA_DIR, 'skills.txt'), 'utf-8'));
}

async function generateZip(seed) {
  const fakeIp = `10.0.${(seed >> 8) & 0xff}.${seed & 0xff}`;
  const rand = await fetch(`${BASE}/api/randomize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': fakeIp },
    body: JSON.stringify({ seed }),
  });
  if (!rand.ok) throw new Error(`randomize ${seed}: ${rand.status} ${await rand.text()}`);
  const dl = await fetch(`${BASE}/api/download?seed=${seed}`, { headers: { 'x-forwarded-for': fakeIp } });
  if (!dl.ok) throw new Error(`download ${seed}: ${dl.status} ${await dl.text()}`);
  return new AdmZip(Buffer.from(await dl.arrayBuffer()));
}

function readTxtFromZip(zip, endsWith) {
  const entry = zip.getEntries().find(e => e.entryName.endsWith(endsWith));
  if (!entry) return null;
  return parseTxt(entry.getData().toString('utf-8'));
}

(async function main() {
  // Sanity-check vanilla expectations
  const vanilla = loadVanilla();
  for (const g of GATED) {
    const v = getRow(vanilla, g.skill);
    if (!v) throw new Error(`vanilla skills.txt missing ${g.skill}`);
    const cltVan = v[colIdx(vanilla, 'cltdofunc')];
    const srvVan = v[colIdx(vanilla, 'srvdofunc')];
    if (cltVan !== g.vanillaCltdofunc || srvVan !== g.vanillaSrvdofunc) {
      throw new Error(`vanilla ${g.skill} cltdofunc=${cltVan}/srvdofunc=${srvVan} does not match expected ${g.vanillaCltdofunc}/${g.vanillaSrvdofunc}`);
    }
  }

  let failures = 0;
  const stats = { keptOnDru: {}, substitutedAway: {}, anchorOnDru: {}, anchorElsewhere: {} };
  for (const g of GATED) {
    stats.keptOnDru[g.skill] = 0;
    stats.substitutedAway[g.skill] = 0;
    stats.anchorOnDru[g.skill] = 0;
    stats.anchorElsewhere[g.skill] = 0;
  }

  for (let i = 0; i < N; i++) {
    const seed = SEED_START + i;
    if (i > 0) await new Promise(r => setTimeout(r, 200));
    const zip = await generateZip(seed);
    const skills = readTxtFromZip(zip, 'skills.txt');
    if (!skills) { console.log(`seed ${seed}: skills.txt missing`); failures++; continue; }

    const ccIdx = colIdx(skills, 'charclass');
    const cltIdx = colIdx(skills, 'cltdofunc');
    const srvIdx = colIdx(skills, 'srvdofunc');
    const restrictIdx = colIdx(skills, 'restrict');

    const lines = [];
    for (const g of GATED) {
      const skillRow = getRow(skills, g.skill);
      const anchorRow = getRow(skills, g.anchor);
      if (!skillRow) { lines.push(`${g.skill} MISSING`); failures++; continue; }
      if (!anchorRow) { lines.push(`${g.anchor} MISSING`); failures++; continue; }

      const skillClass = skillRow[ccIdx];
      const anchorClass = anchorRow[ccIdx];
      const cltdofunc = skillRow[cltIdx];
      const srvdofunc = skillRow[srvIdx];
      const restrict = skillRow[restrictIdx];

      // Identify whether this is a kept Fury/SW or a substitute. Vanilla mechanics
      // intact => kept; otherwise => substitute.
      const isKept = cltdofunc === g.vanillaCltdofunc && srvdofunc === g.vanillaSrvdofunc && restrict === '2';

      if (anchorClass === 'dru') stats.anchorOnDru[g.skill]++;
      else stats.anchorElsewhere[g.skill]++;

      if (isKept) {
        stats.keptOnDru[g.skill]++;
        // Assertion 1: kept ⇒ skill on Druid
        if (skillClass !== 'dru') {
          lines.push(`${g.skill} KEPT but on ${skillClass} (expected dru) ** FAIL **`);
          failures++;
          continue;
        }
        // Assertion 2: kept ⇒ anchor on Druid
        if (anchorClass !== 'dru') {
          lines.push(`${g.skill} KEPT on dru but ${g.anchor} on ${anchorClass} (expected dru) ** FAIL **`);
          failures++;
          continue;
        }
        lines.push(`${g.skill}=kept[dru]  ${g.anchor}=dru  ok`);
      } else {
        stats.substitutedAway[g.skill]++;
        // Substituted: row has borrowed mechanics. The Fury identity row may
        // be on any class (it's always Druid for HARDCODED substitutes since
        // the Druid slot is the one that vacated). Verify it's on Druid.
        if (skillClass !== 'dru') {
          lines.push(`${g.skill} sub but charclass=${skillClass} (expected dru) ** FAIL **`);
          failures++;
          continue;
        }
        lines.push(`${g.skill}=sub[dru]    ${g.anchor}=${anchorClass}  (substitute cltdofunc=${cltdofunc}/srvdofunc=${srvdofunc})`);
      }
    }
    console.log(`seed ${String(seed).padStart(3)}:  ${lines.join('  |  ')}`);
  }

  console.log('\n=== Summary ===');
  for (const g of GATED) {
    const kept = stats.keptOnDru[g.skill];
    const sub = stats.substitutedAway[g.skill];
    const anchorDru = stats.anchorOnDru[g.skill];
    const anchorElse = stats.anchorElsewhere[g.skill];
    console.log(`${g.skill.padEnd(11)}  kept=${kept}/${N}  substituted=${sub}/${N}   ${g.anchor}-on-dru=${anchorDru}  ${g.anchor}-elsewhere=${anchorElse}`);
    // Sanity: all "kept" cases should have anchor on Druid; all "anchor elsewhere" should be substituted.
    if (kept > anchorDru) {
      console.log(`  WARNING: ${g.skill} kept ${kept} times but ${g.anchor} only on Druid ${anchorDru} times`);
    }
    if (sub < anchorElse) {
      console.log(`  WARNING: ${g.skill} substituted only ${sub} times but ${g.anchor} elsewhere ${anchorElse} times — some kept-Fury-without-anchor seeds slipped through`);
    }
  }
  console.log(`\nResult: ${failures === 0 ? 'PASS' : 'FAIL'}  (${failures} failures)`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('FATAL:', e); process.exit(2); });
