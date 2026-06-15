/**
 * find-seed-placement.mjs
 *
 * Search seeds until a given skill lands on a given class in the generated
 * mod, then report the seed plus the row's animation columns. Used for
 * in-game verification of cross-class animation work (e.g. find a seed that
 * puts Sacrifice on the Sorceress, then play it and confirm the hit fires).
 *
 * Seeds are deterministic, so a found seed is shareable with testers.
 *
 * Usage (dev server must be running: npm run dev):
 *   node scripts/find-seed-placement.mjs --skill "Sacrifice" --class sor
 *   node scripts/find-seed-placement.mjs --skill "Bash" --class war --start 100 --max 200
 */
import AdmZip from 'adm-zip';

const BASE = process.env.TARGET || 'http://localhost:3000';

const args = process.argv.slice(2);
function argValue(flag, dflt) {
  const i = args.indexOf(flag);
  return i !== -1 && i + 1 < args.length ? args[i + 1] : dflt;
}
const skillName = argValue('--skill');
const targetClass = argValue('--class');
const startSeed = parseInt(argValue('--start', '1'), 10);
const maxSeeds = parseInt(argValue('--max', '50'), 10);
if (!skillName || !targetClass) {
  console.error('Usage: node scripts/find-seed-placement.mjs --skill "Name" --class <charclass> [--start N] [--max N]');
  process.exit(1);
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
      // raceMode defaults to true and collapses non-race-class trees into
      // Prayer-filler clones — disable it so every class keeps real skills.
      body: JSON.stringify({ seed, raceMode: false }),
    });
    if (r.status === 429) {
      // Fresh-generation rate limit (3/min per IP) — wait out the window.
      process.stdout.write('  (rate limited, waiting 30s)\n');
      await sleep(30_000);
      continue;
    }
    if (!r.ok) throw new Error(`randomize ${seed}: ${r.status} ${await r.text()}`);
    break;
  }
  const dl = await fetch(`${BASE}/api/download?seed=${seed}&raceMode=0`);
  if (!dl.ok) throw new Error(`download ${seed}: ${dl.status} ${await dl.text()}`);
  return new AdmZip(Buffer.from(await dl.arrayBuffer()));
}

for (let seed = startSeed; seed < startSeed + maxSeeds; seed++) {
  const zip = await generateZip(seed);

  // Sanity: every generated zip must carry the repaired animdata.d2
  const animEntry = zip.getEntries().find(e => e.entryName.endsWith('data/global/animdata.d2'));
  if (!animEntry) {
    console.error(`seed ${seed}: zip is missing data/global/animdata.d2 — zip integration broken`);
    process.exit(1);
  }

  const entry = zip.getEntries().find(e => e.entryName.endsWith('data/global/excel/skills.txt'));
  const { headers, rows } = parseTxt(entry.getData().toString('utf-8'));
  const col = (n) => headers.indexOf(n);
  const row = rows.find(r => r[0] === skillName);
  if (!row) {
    console.error(`seed ${seed}: no skills.txt row named "${skillName}"`);
    process.exit(1);
  }
  const cls = row[col('charclass')];
  process.stdout.write(`seed ${seed}: ${skillName} -> ${cls}\n`);
  if (cls === targetClass) {
    console.log('\nFOUND');
    console.log(`  seed:      ${seed}`);
    console.log(`  skill:     ${skillName}`);
    console.log(`  charclass: ${cls}`);
    for (const c of ['anim', 'seqtrans', 'seqnum', 'seqinput', 'restrict', 'reqlevel']) {
      console.log(`  ${c}: ${row[col(c)] ?? ''}`);
    }
    console.log(`\nIn-game check: roll this seed, level the target class to the skill,`);
    console.log(`and confirm the attack/effect actually lands (not just the animation).`);
    process.exit(0);
  }
}
console.log(`\nNo seed in [${startSeed}, ${startSeed + maxSeeds}) placed ${skillName} on ${targetClass}. Try --max higher.`);
process.exit(2);
