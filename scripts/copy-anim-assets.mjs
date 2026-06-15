/**
 * copy-anim-assets.mjs
 *
 * One-shot: copy the raw animation binaries the randomizer needs from a CASC
 * extraction into the repo (data/anim/). Re-run after a D2R patch re-extraction
 * (see scripts/extract-casc.ps1) to refresh them.
 *
 * What gets committed and why:
 *   - data/anim/animdata.d2 — raw vanilla file; src/lib/anim/anim-assets.ts
 *     patches the 14 desynced WK (Warlock) A1/A2 records in memory at runtime.
 *   - data/anim/cof/wk{a1,a2}*.cof — the ground-truth COFs those records are
 *     synced against (COF frame counts match the real DCC art; the vanilla
 *     animdata.d2 WK A1/A2 records do not).
 *
 * Usage: node scripts/copy-anim-assets.mjs --dir D:\D2RModding\data
 */
import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const i = args.indexOf('--dir');
const dirArg = i !== -1 ? args[i + 1] : undefined;
if (!dirArg) {
  console.error('Usage: node scripts/copy-anim-assets.mjs --dir <extraction root>');
  process.exit(1);
}
// Accept the extraction root or its data/ folder (same resolution as audit-cof.mjs).
let dataRoot = null;
for (const candidate of [dirArg, path.join(dirArg, 'data'), path.join(dirArg, 'data', 'data')]) {
  if (fs.existsSync(path.join(candidate, 'global'))) { dataRoot = candidate; break; }
}
if (!dataRoot) {
  console.error(`Could not find global/ under ${dirArg}`);
  process.exit(1);
}

const repoRoot = process.cwd();
const outAnimDir = path.join(repoRoot, 'data', 'anim');
const outCofDir = path.join(outAnimDir, 'cof');
fs.mkdirSync(outCofDir, { recursive: true });

// animdata.d2
const animSrc = path.join(dataRoot, 'global', 'animdata.d2');
if (!fs.existsSync(animSrc)) {
  console.error(`Missing ${animSrc} — extract it first (scripts/extract-casc.ps1)`);
  process.exit(1);
}
fs.copyFileSync(animSrc, path.join(outAnimDir, 'animdata.d2'));
console.log(`copied animdata.d2 (${fs.statSync(animSrc).size} bytes)`);

// The 14 WK A1/A2 COFs (every A1/A2 weapon-class variant Warlock has)
const wkCofDir = path.join(dataRoot, 'global', 'chars', 'wk', 'cof');
const wanted = fs.readdirSync(wkCofDir)
  .filter(f => /^wk(a1|a2)/i.test(f) && f.toLowerCase().endsWith('.cof'))
  .sort();
if (wanted.length === 0) {
  console.error(`No WK A1/A2 COFs found in ${wkCofDir}`);
  process.exit(1);
}
for (const f of wanted) {
  fs.copyFileSync(path.join(wkCofDir, f), path.join(outCofDir, f.toLowerCase()));
  console.log(`copied ${f}`);
}

// The 3 Amazon S1 COFs that lack attack trigger frames in vanilla — they get
// the event injected at runtime (COF_TRIGGER_INJECTIONS in patch-config.ts).
const amCofDir = path.join(dataRoot, 'global', 'chars', 'am', 'cof');
const amWanted = ['ams11hs.cof', 'ams11ht.cof', 'ams1xbw.cof'];
for (const f of amWanted) {
  fs.copyFileSync(path.join(amCofDir, f), path.join(outCofDir, f));
  console.log(`copied ${f}`);
}
console.log(`done: animdata.d2 + ${wanted.length + amWanted.length} COFs -> ${outAnimDir}`);
