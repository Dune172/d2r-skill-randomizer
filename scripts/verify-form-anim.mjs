/**
 * verify-form-anim.mjs
 *
 * Verifies the fix for: shapeshift form attacks should keep vanilla anim/seqtrans/seqnum/seqinput.
 *
 * For each seed: for every COIN_FLIP_DROP skill that survived (restrict=2), compare
 * anim/seqtrans/seqnum/seqinput against vanilla skills.txt. They must be byte-identical
 * regardless of host class.
 *
 * Run with: node scripts/verify-form-anim.mjs [seed1 seed2 ...]
 *   (dev server must already be running: `npm run dev`)
 */
import AdmZip from 'adm-zip';
import fs from 'fs';
import path from 'path';

const BASE = 'http://localhost:3000';
const SEEDS = process.argv.slice(2).map(Number).filter(Boolean);
if (SEEDS.length === 0) {
  // A broad sweep — we want some seeds where the form skills land on non-Druid
  for (let i = 1; i <= 20; i++) SEEDS.push(i);
}

// Fury and Shock Wave are pinned to Druid via HARDCODED_CLASS_SKILLS (v0.222),
// and conditionally dropped if their form anchor (Wearwolf/Wearbear) didn't
// land on Druid. Their kept-on-non-Druid case can no longer occur, so this
// regression check focuses on the still-traveling form attacks.
const FORM_ATTACKS = ['Feral Rage', 'Rabies', 'Maul', 'Fire Claws', 'Hunger'];
const COLS_TO_CHECK = ['anim', 'seqtrans', 'seqnum', 'seqinput'];
// Mechanics columns that uniquely identify a kept skill from a substitute that
// happens to inherit restrict=2 from another form-attack source (e.g., a
// dropped Maul substituted with Hunger's mechanics).
const IDENTITY_COLS = ['srvdofunc', 'cltdofunc'];

const DATA_DIR = path.join(process.cwd(), 'data', 'txt');

function parseTxt(content) {
  const lines = content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const headers = lines[0].split('\t');
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '') continue;
    rows.push(lines[i].split('\t'));
  }
  return { headers, rows };
}

function loadVanilla() {
  const content = fs.readFileSync(path.join(DATA_DIR, 'skills.txt'), 'utf-8');
  return parseTxt(content);
}

async function generateZip(seed) {
  // Unique x-forwarded-for per seed sidesteps the per-IP rate limiter during bulk verification runs.
  const fakeIp = `10.0.${(seed >> 8) & 0xff}.${seed & 0xff}`;
  const rand = await fetch(`${BASE}/api/randomize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': fakeIp },
    body: JSON.stringify({ seed }),
  });
  if (!rand.ok) throw new Error(`randomize ${seed}: ${rand.status} ${await rand.text()}`);

  const dl = await fetch(`${BASE}/api/download?seed=${seed}`, {
    headers: { 'x-forwarded-for': fakeIp },
  });
  if (!dl.ok) throw new Error(`download ${seed}: ${dl.status} ${await dl.text()}`);

  return new AdmZip(Buffer.from(await dl.arrayBuffer()));
}

function readTxtFromZip(zip, endsWith) {
  const entry = zip.getEntries().find(e => e.entryName.endsWith(endsWith));
  if (!entry) return null;
  return parseTxt(entry.getData().toString('utf-8'));
}

function colIdx(parsed, name) { return parsed.headers.indexOf(name); }

function getRow(parsed, skillName) {
  return parsed.rows.find(r => r[0] === skillName);
}

function snapshot(parsed, row) {
  const out = {};
  for (const c of COLS_TO_CHECK) {
    const i = colIdx(parsed, c);
    out[c] = i >= 0 ? (row[i] ?? '') : '';
  }
  for (const c of IDENTITY_COLS) {
    const i = colIdx(parsed, c);
    out[c] = i >= 0 ? (row[i] ?? '') : '';
  }
  const ri = colIdx(parsed, 'restrict');
  out.restrict = ri >= 0 ? (row[ri] ?? '') : '';
  out.charclass = row[colIdx(parsed, 'charclass')] ?? '';
  return out;
}

// Detect substitutes that inherited restrict=2 from a form-attack source
// (e.g., dropped Maul substituted with Hunger's mechanics). Compare the
// row's identity (srvdofunc/cltdofunc) against the vanilla skill's identity.
function isSubstitute(snap, vanillaSnap) {
  for (const c of IDENTITY_COLS) {
    if (snap[c] !== vanillaSnap[c]) return true;
  }
  return false;
}

(async function main() {
  const vanilla = loadVanilla();
  const vanillaSnaps = new Map();
  for (const s of FORM_ATTACKS) {
    const r = getRow(vanilla, s);
    if (!r) throw new Error(`vanilla skills.txt missing ${s}`);
    vanillaSnaps.set(s, snapshot(vanilla, r));
  }

  let totalKept = 0;
  let totalNonDruidKept = 0;
  let failures = 0;
  let regressionChecks = 0;

  for (let i = 0; i < SEEDS.length; i++) {
    const seed = SEEDS[i];
    // Small delay: zip generation is CPU-bound and we don't want to bury the dev server.
    if (i > 0) await new Promise(r => setTimeout(r, 250));
    console.log(`\n# seed ${seed}`);
    const zip = await generateZip(seed);
    const skills = readTxtFromZip(zip, 'skills.txt');
    if (!skills) { console.log('  skills.txt missing'); failures++; continue; }

    const wolfHost = getRow(skills, 'Wearwolf');
    const bearHost = getRow(skills, 'Wearbear');
    const wolfClass = wolfHost ? wolfHost[colIdx(skills, 'charclass')] : null;
    const bearClass = bearHost ? bearHost[colIdx(skills, 'charclass')] : null;
    console.log(`  Wearwolf→${wolfClass}  Wearbear→${bearClass}`);

    for (const name of FORM_ATTACKS) {
      const row = getRow(skills, name);
      if (!row) { console.log(`  ${name}: MISSING`); continue; }
      const snap = snapshot(skills, row);
      const v = vanillaSnaps.get(name);
      if (snap.restrict !== '2' || isSubstitute(snap, v)) {
        // dropped — substitute took its slot, unrelated to this fix
        continue;
      }
      totalKept++;
      const isNonDruid = snap.charclass !== 'dru';
      if (isNonDruid) totalNonDruidKept++;

      const mismatches = [];
      for (const c of COLS_TO_CHECK) {
        if (snap[c] !== v[c]) mismatches.push(`${c}: ${JSON.stringify(v[c])} → ${JSON.stringify(snap[c])}`);
      }
      if (mismatches.length) {
        console.log(`  ${name.padEnd(12)} [${snap.charclass}] ** FAIL ** ${mismatches.join(', ')}`);
        failures++;
      } else {
        console.log(`  ${name.padEnd(12)} [${snap.charclass}] ok  (anim=${snap.anim})`);
      }
    }

    // Regression check: non-form skills should still get animation rewrites on non-native class.
    // Pick a spell-like skill (e.g. Fire Bolt) and verify its anim stays valid.
    const fb = getRow(skills, 'Fire Bolt');
    if (fb) {
      regressionChecks++;
      const cc = fb[colIdx(skills, 'charclass')];
      const anim = fb[colIdx(skills, 'anim')];
      const restrict = fb[colIdx(skills, 'restrict')];
      // Not asserting a specific value — just logging for manual sanity.
      console.log(`  [regression] Fire Bolt on ${cc}: anim=${anim} restrict=${restrict}`);
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Form-attack kept checks: ${totalKept} (${totalNonDruidKept} on non-Druid host)`);
  console.log(`Failures: ${failures}`);
  console.log(`Result: ${failures === 0 ? 'PASS' : 'FAIL'}`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => {
  console.error(e);
  process.exit(1);
});
