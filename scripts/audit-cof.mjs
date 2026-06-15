/**
 * audit-cof.mjs
 *
 * Read-only audit of COF trigger frames + animdata.d2 records from a CASC
 * extraction. Drives the trigger-injection patch list (src/lib/anim/patch-config.ts):
 * shows which (token, mode, weaponclass) animations lack attack/missile frame
 * events, what the donor classes use, and whether COF and animdata.d2 agree.
 *
 * The parsing logic mirrors src/lib/anim/cof-parser.ts and animdata-parser.ts
 * (kept standalone so this runs without a build step).
 *
 * Usage:
 *   node scripts/audit-cof.mjs --dir D:\D2RModding\data --list-tokens
 *   node scripts/audit-cof.mjs --dir D:\D2RModding\data --tokens SO,WK,NE,PA,BA --modes A1,A2,SQ,SC
 *   node scripts/audit-cof.mjs --dir D:\D2RModding\data --tokens SO --modes A1 --events-only
 *
 * Options:
 *   --dir <path>     Extraction root (the folder that contains data\global\...).
 *                    Also accepts the data\ folder itself.
 *   --list-tokens    List directories under data/global/chars (token discovery).
 *   --tokens A,B     Comma-separated character tokens (default: SO,WK,NE,PA,BA).
 *   --modes A1,SC    Comma-separated 2-char mode codes (default: A1,A2,SQ,SC,S1,S2,S3,S4,TH,KK).
 *   --events-only    Only print COFs that HAVE at least one nonzero event (donor survey).
 *   --missing-only   Only print COFs with NO nonzero events (injection candidates).
 */
import fs from 'fs';
import path from 'path';

const EVENT_NAMES = ['none', 'attack', 'missile', 'sound', 'skill'];
const RECORD_SIZE = 160;
const NUM_EVENTS = 144;

// ---------- arg parsing ----------
const args = process.argv.slice(2);
function argValue(flag) {
  const i = args.indexOf(flag);
  return i !== -1 && i + 1 < args.length ? args[i + 1] : undefined;
}
const dirArg = argValue('--dir');
if (!dirArg) {
  console.error('Missing --dir <extraction root>');
  process.exit(1);
}
// Accept the extraction root, its data/ folder, or anything containing data/global.
function resolveDataRoot(p) {
  for (const candidate of [p, path.join(p, 'data'), path.join(p, 'data', 'data')]) {
    if (fs.existsSync(path.join(candidate, 'global'))) return candidate;
  }
  console.error(`Could not find global/ under ${p} (tried ${p}, ${p}\\data, ${p}\\data\\data)`);
  process.exit(1);
}
const dataRoot = resolveDataRoot(dirArg);
const charsDir = path.join(dataRoot, 'global', 'chars');
const animDataPath = path.join(dataRoot, 'global', 'animdata.d2');

// ---------- COF parsing (mirrors src/lib/anim/cof-parser.ts) ----------
function parseCof(buf, name) {
  if (buf.length < 28) return { error: `too small (${buf.length} bytes)` };
  const layers = buf[0];
  const frames = buf[1];
  const directions = buf[2];
  const expected = 28 + 9 * layers + frames + directions * frames * layers;
  if (buf.length !== expected) {
    return { error: `size mismatch: L=${layers} F=${frames} D=${directions} expects ${expected}, file is ${buf.length}` };
  }
  const triggerOffset = 28 + 9 * layers;
  const events = Array.from(buf.subarray(triggerOffset, triggerOffset + frames));
  return { name, layers, frames, directions, speed: buf[24], events };
}

// ---------- animdata parsing (mirrors src/lib/anim/animdata-parser.ts) ----------
function parseAnimData(buf) {
  const records = new Map(); // name → record
  let off = 0;
  for (let block = 0; block < 256; block++) {
    const count = buf.readUInt32LE(off);
    off += 4;
    if (count > 1000 || off + count * RECORD_SIZE > buf.length) {
      throw new Error(`animdata.d2: implausible block ${block} (count=${count})`);
    }
    for (let i = 0; i < count; i++) {
      const raw = buf.toString('ascii', off, off + 8);
      const nul = raw.indexOf('\0');
      const name = (nul === -1 ? raw : raw.slice(0, nul)).toUpperCase();
      records.set(name, {
        name,
        offset: off,
        framesPerDirection: buf.readUInt32LE(off + 8),
        speed: buf.readUInt16LE(off + 12),
        events: Array.from(buf.subarray(off + 16, off + 16 + NUM_EVENTS)),
      });
      off += RECORD_SIZE;
    }
  }
  if (off !== buf.length) throw new Error(`animdata.d2: ${buf.length - off} trailing bytes`);
  return records;
}

function formatEvents(events, frameCount) {
  const hits = [];
  for (let i = 0; i < frameCount; i++) {
    if (events[i] !== 0) hits.push(`f${i}=${EVENT_NAMES[events[i]] ?? events[i]}`);
  }
  return hits.length ? hits.join(' ') : '(no events)';
}

// ---------- --list-tokens ----------
if (args.includes('--list-tokens')) {
  if (!fs.existsSync(charsDir)) {
    console.error(`No chars directory at ${charsDir} — extract data/global/chars from CASC first.`);
    process.exit(1);
  }
  const tokens = fs.readdirSync(charsDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name.toUpperCase())
    .sort();
  console.log(`Tokens under ${charsDir}:`);
  console.log(tokens.join(' '));
  process.exit(0);
}

// ---------- main audit ----------
const tokens = (argValue('--tokens') ?? 'SO,WK,NE,PA,BA').split(',').map(s => s.trim().toUpperCase());
const modes = (argValue('--modes') ?? 'A1,A2,SQ,SC,S1,S2,S3,S4,TH,KK').split(',').map(s => s.trim().toUpperCase());
const eventsOnly = args.includes('--events-only');
const missingOnly = args.includes('--missing-only');

let animRecords = null;
if (fs.existsSync(animDataPath)) {
  animRecords = parseAnimData(fs.readFileSync(animDataPath));
  console.log(`animdata.d2: ${animRecords.size} records loaded\n`);
} else {
  console.warn(`WARNING: ${animDataPath} not found — COF-only audit, no animdata cross-check.\n`);
}

if (!fs.existsSync(charsDir)) {
  console.error(`No chars directory at ${charsDir} — extract data/global/chars from CASC first.`);
  process.exit(1);
}

const injectionCandidates = [];
let mismatches = 0;

for (const token of tokens) {
  const cofDir = path.join(charsDir, token, 'cof');
  // Token folders may be lower/upper case depending on extractor.
  const actualDir = [cofDir, path.join(charsDir, token.toLowerCase(), 'cof')].find(p => fs.existsSync(p));
  if (!actualDir) {
    console.log(`== ${token}: no cof directory (looked in ${cofDir}) ==\n`);
    continue;
  }
  const files = fs.readdirSync(actualDir)
    .filter(f => f.toLowerCase().endsWith('.cof'))
    .filter(f => modes.includes(f.slice(2, 4).toUpperCase()))
    .sort();
  console.log(`== ${token} (${files.length} COFs matching modes ${modes.join(',')}) ==`);

  for (const file of files) {
    const cofName = file.replace(/\.cof$/i, '').toUpperCase();
    const buf = fs.readFileSync(path.join(actualDir, file));
    const cof = parseCof(buf, cofName);
    if (cof.error) {
      console.log(`  ${cofName}: PARSE ERROR — ${cof.error}`);
      continue;
    }
    const hasEvents = cof.events.some(e => e !== 0);
    if (eventsOnly && !hasEvents) continue;
    if (missingOnly && hasEvents) continue;

    let animNote = '';
    if (animRecords) {
      const rec = animRecords.get(cofName);
      if (!rec) {
        animNote = ' | animdata: MISSING RECORD';
        mismatches++;
      } else {
        const fpdMatch = rec.framesPerDirection === cof.frames;
        const evMatch = cof.events.every((e, i) => rec.events[i] === e);
        if (fpdMatch && evMatch) {
          animNote = ' | animdata: in sync';
        } else {
          animNote = ` | animdata: DESYNC (fpd=${rec.framesPerDirection}${fpdMatch ? '' : '≠'}, events ${evMatch ? 'match' : formatEvents(rec.events, Math.min(rec.framesPerDirection, NUM_EVENTS))})`;
          mismatches++;
        }
      }
    }
    console.log(`  ${cofName}: L=${cof.layers} F=${cof.frames} D=${cof.directions} speed=${cof.speed} | ${formatEvents(cof.events, cof.frames)}${animNote}`);
    if (!hasEvents) injectionCandidates.push({ token, cofName, frames: cof.frames });
  }
  console.log('');
}

console.log('---- summary ----');
console.log(`Injection candidates (COFs with zero events): ${injectionCandidates.length}`);
for (const c of injectionCandidates) console.log(`  ${c.cofName} (F=${c.frames})`);
if (animRecords) console.log(`COF↔animdata mismatches: ${mismatches}`);
