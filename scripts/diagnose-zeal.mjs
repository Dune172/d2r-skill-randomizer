/**
 * diagnose-zeal.mjs
 *
 * Verifies the v0.253 unlock of Zeal across all 8 classes. Zeal is no longer
 * pinned to Paladin or excluded from any class — its multi-hit handler
 * (srvstfunc=37/srvdofunc=13/cltstfunc=53/cltdofunc=21) is class-agnostic, and
 * A1 is now a supported anim on every class, so the swing animates everywhere.
 *
 * For each seed, asserts on the generated skills.txt Zeal row:
 *   1. Mechanics intact: srvdofunc=13, cltdofunc=21 (handler never altered).
 *   2. anim=A1 and seqtrans=A1 on EVERY host class — never downgraded to SQ/SC.
 *      (pickBestAnim must keep A1 on sor/war too, now that A1 is supported.)
 *   3. restrict is blank or 1 (normal attack, or promoted to also-usable-in-form
 *      when Zeal lands on a Werewolf/Werebear host). restrict=2 (form-ONLY) would
 *      be a failure, but the promotion path never sets that.
 * Across the sweep it also reports the spread of host classes — Zeal should
 * appear on a variety of classes (it's a plain shuffle-pool skill now).
 *
 * Run with: node scripts/diagnose-zeal.mjs [start] [count]
 *   (dev server must already be running: `npm run dev`)
 */
import AdmZip from 'adm-zip';
import fs from 'fs';
import path from 'path';

const BASE = 'http://localhost:3000';
const SEED_START = Number(process.argv[2]) || 1;
const N = Number(process.argv[3]) || 40;
const DATA_DIR = path.join(process.cwd(), 'data', 'txt');

const VANILLA_SRVDOFUNC = '13';
const VANILLA_CLTDOFUNC = '21';

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
function getRow(parsed, skillName) { return parsed.rows.find(r => r[0] === skillName); }

function loadVanilla() {
  return parseTxt(fs.readFileSync(path.join(DATA_DIR, 'skills.txt'), 'utf-8'));
}

async function generateZip(seed) {
  const fakeIp = `10.0.${(seed >> 8) & 0xff}.${seed & 0xff}`;
  const rand = await fetch(`${BASE}/api/randomize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': fakeIp },
    // raceMode:false so all 8 classes keep their real randomized trees — race
    // mode would fill 7/8 classes with Prayer filler and hide Zeal's placement.
    body: JSON.stringify({ seed, raceMode: false }),
  });
  if (!rand.ok) throw new Error(`randomize ${seed}: ${rand.status} ${await rand.text()}`);
  const dl = await fetch(`${BASE}/api/download?seed=${seed}&raceMode=0`, { headers: { 'x-forwarded-for': fakeIp } });
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
  const v = getRow(vanilla, 'Zeal');
  if (!v) throw new Error('vanilla skills.txt missing Zeal');
  const srvVan = v[colIdx(vanilla, 'srvdofunc')];
  const cltVan = v[colIdx(vanilla, 'cltdofunc')];
  if (srvVan !== VANILLA_SRVDOFUNC || cltVan !== VANILLA_CLTDOFUNC) {
    throw new Error(`vanilla Zeal srvdofunc=${srvVan}/cltdofunc=${cltVan} != expected ${VANILLA_SRVDOFUNC}/${VANILLA_CLTDOFUNC}`);
  }

  let failures = 0;
  const classCounts = {};

  for (let i = 0; i < N; i++) {
    const seed = SEED_START + i;
    if (i > 0) await new Promise(r => setTimeout(r, 200));
    const zip = await generateZip(seed);
    const skills = readTxtFromZip(zip, 'skills.txt');
    if (!skills) { console.log(`seed ${seed}: skills.txt missing`); failures++; continue; }

    const ccIdx = colIdx(skills, 'charclass');
    const srvIdx = colIdx(skills, 'srvdofunc');
    const cltIdx = colIdx(skills, 'cltdofunc');
    const animIdx = colIdx(skills, 'anim');
    const seqtransIdx = colIdx(skills, 'seqtrans');
    const restrictIdx = colIdx(skills, 'restrict');

    const row = getRow(skills, 'Zeal');
    if (!row) { console.log(`seed ${seed}: Zeal MISSING (dropped?)`); classCounts['(dropped)'] = (classCounts['(dropped)'] || 0) + 1; continue; }

    const cls = row[ccIdx];
    const srv = row[srvIdx];
    const clt = row[cltIdx];
    const anim = row[animIdx];
    const seqtrans = row[seqtransIdx];
    const restrict = row[restrictIdx] || '';
    classCounts[cls] = (classCounts[cls] || 0) + 1;

    const problems = [];
    if (srv !== VANILLA_SRVDOFUNC) problems.push(`srvdofunc=${srv}`);
    if (clt !== VANILLA_CLTDOFUNC) problems.push(`cltdofunc=${clt}`);
    if (anim !== 'A1') problems.push(`anim=${anim}`);
    if (seqtrans !== 'A1') problems.push(`seqtrans=${seqtrans}`);
    if (restrict !== '' && restrict !== '1') problems.push(`restrict=${restrict}`);

    if (problems.length) {
      console.log(`seed ${String(seed).padStart(3)}:  Zeal on ${cls}  ** FAIL ** ${problems.join(' ')}`);
      failures++;
    } else {
      console.log(`seed ${String(seed).padStart(3)}:  Zeal on ${cls}  anim=A1 srv=13 clt=21  ok`);
    }
  }

  console.log('\n=== Host-class spread ===');
  for (const [cls, n] of Object.entries(classCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cls.padEnd(10)} ${n}`);
  }
  console.log(`\nResult: ${failures === 0 ? 'PASS' : 'FAIL'}  (${failures} failures)`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('FATAL:', e); process.exit(2); });
