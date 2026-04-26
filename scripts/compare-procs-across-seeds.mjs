/**
 * compare-procs-across-seeds.mjs
 *
 * Confirms proc randomization is working — picks a few specific affixes
 * (e.g. "of Frost Shield" gethit-skill, "of Lightning" att-skill) and
 * shows what skill they resolve to across 3 seeds. Different = randomized,
 * same = identity-preserved (would mean fix didn't deploy).
 *
 * Run with: node scripts/compare-procs-across-seeds.mjs
 *   (dev server must be running)
 */
import AdmZip from 'adm-zip';

const BASE = 'http://localhost:3000';
const SEEDS = [1, 1337, 92068106];
const SAMPLES = [
  { file: 'magicsuffix.txt', name: 'of Frost Shield' },
  { file: 'magicsuffix.txt', name: 'of Lightning' },
  { file: 'magicsuffix.txt', name: 'of Nova' },
  { file: 'magicsuffix.txt', name: 'of Iron Maiden' },
  { file: 'magicsuffix.txt', name: 'of Hydras' },
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

async function genZip(seed) {
  const r = await fetch(`${BASE}/api/randomize`, {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ seed }),
  });
  if (!r.ok) throw new Error(`randomize ${seed}: ${r.status} ${await r.text()}`);
  const dl = await fetch(`${BASE}/api/download?seed=${seed}`);
  if (!dl.ok) throw new Error(`download ${seed}: ${dl.status} ${await dl.text()}`);
  return new AdmZip(Buffer.from(await dl.arrayBuffer()));
}

function readTxt(zip, suffix) {
  const e = zip.getEntries().find(x => x.entryName.endsWith(suffix));
  return e ? parseTxt(e.getData().toString('utf-8')) : null;
}

(async () => {
  const out = {};
  for (const seed of SEEDS) {
    const zip = await genZip(seed);
    const skills = readTxt(zip, 'skills.txt');
    out[seed] = { skills, files: {} };
    for (const s of SAMPLES) out[seed].files[s.file] ??= readTxt(zip, s.file);
  }
  const skillNameForRow = (skillsTxt, rowIndex) => skillsTxt.rows[rowIndex]?.[0] ?? '<oob>';

  console.log('\nProc skill resolved at param row index, by seed:\n');
  for (const sample of SAMPLES) {
    console.log(`  ${sample.file} :: ${sample.name}`);
    for (const seed of SEEDS) {
      const file = out[seed].files[sample.file];
      const matches = file.rows.filter(r => r[0] === sample.name);
      const codes = [];
      for (const r of matches) {
        for (let slot = 1; slot <= 3; slot++) {
          const codeCol = file.headers.indexOf(`mod${slot}code`);
          const paramCol = file.headers.indexOf(`mod${slot}param`);
          const code = r[codeCol];
          if (code && code !== '' && r[paramCol]) {
            const id = parseInt(r[paramCol], 10);
            if (!isNaN(id)) {
              codes.push(`${code} → ${skillNameForRow(out[seed].skills, id)} (row ${id})`);
            }
          }
        }
      }
      console.log(`    seed ${seed}: ${codes.join(' | ')}`);
    }
    console.log();
  }
})().catch(e => { console.error(e); process.exit(1); });
