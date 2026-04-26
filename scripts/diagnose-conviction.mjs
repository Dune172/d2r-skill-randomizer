/**
 * diagnose-conviction.mjs
 *
 * Diagnostic for the "Lord De Seis Conviction aura missing in-game" bug.
 *
 * Generates a deterministic seed via the dev server, extracts the zip, and
 * prints the state of the Conviction skill + Lord De Seis's reference chain
 * so we can see which link the randomizer is breaking.
 *
 * Run with: node scripts/diagnose-conviction.mjs
 *   (dev server must already be running: `npm run dev`)
 */
import AdmZip from 'adm-zip';
import fs from 'fs';
import path from 'path';

const BASE = 'http://localhost:3000';
const SEED = 1;
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

function loadVanilla(filename) {
  const content = fs.readFileSync(path.join(DATA_DIR, filename), 'utf-8');
  return parseTxt(content);
}

async function generateZip(seed) {
  const rand = await fetch(`${BASE}/api/randomize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ seed }),
  });
  if (!rand.ok) throw new Error(`randomize ${seed}: ${rand.status} ${await rand.text()}`);

  const dl = await fetch(`${BASE}/api/download?seed=${seed}`);
  if (!dl.ok) throw new Error(`download ${seed}: ${dl.status} ${await dl.text()}`);

  return new AdmZip(Buffer.from(await dl.arrayBuffer()));
}

function readTxtFromZip(zip, endsWith) {
  const entry = zip.getEntries().find(e => e.entryName.endsWith(endsWith));
  if (!entry) return null;
  return parseTxt(entry.getData().toString('utf-8'));
}

function findRow(parsed, colIndex, value) {
  return parsed.rows.findIndex(r => r[colIndex] === value);
}

function headerIdx(parsed, name) {
  return parsed.headers.indexOf(name);
}

function skillSummary(parsed, rowIdx, label) {
  if (rowIdx < 0) {
    console.log(`  ${label}: <row not found>`);
    return;
  }
  const r = parsed.rows[rowIdx];
  const cols = {
    name:             r[0],
    '*Id':            r[headerIdx(parsed, '*Id')],
    charclass:        r[headerIdx(parsed, 'charclass')],
    aurastate:        r[headerIdx(parsed, 'aurastate')],
    auratargetstate:  r[headerIdx(parsed, 'auratargetstate')],
    passivestate:     r[headerIdx(parsed, 'passivestate')],
    anim:             r[headerIdx(parsed, 'anim')],
    seqtrans:         r[headerIdx(parsed, 'seqtrans')],
    reqlevel:         r[headerIdx(parsed, 'reqlevel')],
  };
  console.log(`  ${label} (row ${rowIdx}):`);
  for (const [k, v] of Object.entries(cols)) {
    console.log(`    ${k.padEnd(18)} = ${JSON.stringify(v ?? '')}`);
  }
}

(async function main() {
  console.log(`\n=== Diagnose Conviction (seed=${SEED}) ===\n`);

  // Vanilla skills.txt — find Conviction's original row
  const vanillaSkills = loadVanilla('skills.txt');
  const vanillaConvRow = findRow(vanillaSkills, 0, 'Conviction');
  console.log('# Vanilla skills.txt');
  skillSummary(vanillaSkills, vanillaConvRow, 'Conviction');

  // Randomized output
  console.log(`\n# Fetching seed ${SEED} from ${BASE} …`);
  const zip = await generateZip(SEED);
  const outSkills = readTxtFromZip(zip, 'skills.txt');
  const outMonstats = readTxtFromZip(zip, 'monstats.txt');
  const outSu = readTxtFromZip(zip, 'superuniques.txt');

  if (!outSkills) throw new Error('skills.txt missing from zip');
  console.log('\n# Randomized skills.txt');
  const outConvRow = findRow(outSkills, 0, 'Conviction');
  skillSummary(outSkills, outConvRow, 'Conviction (after randomization)');

  // Whatever skill now occupies Conviction's OLD vanilla row index —
  // this is what vanilla monumod.txt resolves to if references are by row.
  console.log(`\n# Skill at Conviction's OLD vanilla row index (${vanillaConvRow})`);
  skillSummary(outSkills, vanillaConvRow, 'Skill now at that row');

  // Compare *Id values for sanity — *Id should be untouched (column 1)
  if (outConvRow >= 0 && vanillaConvRow >= 0) {
    const vId = vanillaSkills.rows[vanillaConvRow][headerIdx(vanillaSkills, '*Id')];
    const oId = outSkills.rows[outConvRow][headerIdx(outSkills, '*Id')];
    console.log(`\n# *Id sanity: vanilla=${vId}  randomized=${oId}  ${vId === oId ? 'OK' : '*** DRIFTED ***'}`);
  }

  // Lord De Seis's superuniques row
  if (outSu) {
    console.log('\n# Randomized superuniques.txt — Lord De Seis');
    const ldsIdx = findRow(outSu, 0, 'Lord De Seis');
    if (ldsIdx < 0) {
      console.log('  <Lord De Seis row not found>');
    } else {
      const r = outSu.rows[ldsIdx];
      const fields = ['Superunique', 'Name', 'Class', 'Mod1', 'Mod2', 'Mod3'];
      for (const f of fields) {
        const i = headerIdx(outSu, f);
        console.log(`  ${f.padEnd(12)} = ${JSON.stringify(i >= 0 ? r[i] : '<no header>')}`);
      }
    }
  } else {
    console.log('\n# superuniques.txt not present in zip');
  }

  // doomknight3 monstats row — Skill1..8
  if (outMonstats) {
    console.log('\n# Randomized monstats.txt — doomknight3 (Lord De Seis base)');
    const dk3Idx = findRow(outMonstats, 0, 'doomknight3');
    if (dk3Idx < 0) {
      console.log('  <doomknight3 row not found>');
    } else {
      const r = outMonstats.rows[dk3Idx];
      for (let i = 1; i <= 8; i++) {
        const sIdx = headerIdx(outMonstats, `Skill${i}`);
        const mIdx = headerIdx(outMonstats, `Sk${i}mode`);
        const lIdx = headerIdx(outMonstats, `Sk${i}lvl`);
        if (sIdx < 0) continue;
        const skill = r[sIdx] ?? '';
        if (!skill) continue;
        console.log(`  Skill${i} = ${JSON.stringify(skill)}  mode=${JSON.stringify(r[mIdx] ?? '')}  lvl=${JSON.stringify(r[lIdx] ?? '')}`);
      }
    }
  } else {
    console.log('\n# monstats.txt not present in zip');
  }

  console.log('\n=== Interpretation ===');
  console.log('If the "Skill now at Conviction\'s OLD row" has empty aurastate or a different aurastate,');
  console.log('and vanilla monumod.txt references Conviction by row index, that breaks the aura.');
  console.log('If Conviction\'s charclass changed from "pal" to something else, it may not work');
  console.log('as a monster aura even if monumod resolves the skill correctly.\n');
})().catch(e => {
  console.error(e);
  process.exit(1);
});
