/**
 * verify-controller-skills.mjs
 *
 * Verifies that each generated mod ships data/hd/global/excel/controllerskillsettings.json
 * remapped to the shuffled skills.txt rows (src/lib/randomizer/controller-skills-writer.ts).
 * D2R keys gamepad skill behavior by row id, so every entry must describe the skill that
 * now sits in its row, not the vanilla skill that used to.
 *
 * Drives the running Next.js dev server. Run with:
 *   node scripts/verify-controller-skills.mjs [--base http://localhost:3000] [--baseline <dir>] [--save <dir>]
 *
 * --baseline <dir> compares every other zip entry byte-for-byte against <case>.zip files
 * generated before the change (keyboard/mouse output must be unchanged).
 * --save <dir> writes each generated zip as <case>.zip.
 *
 * Checks per zip:
 *   1. The JSON is present; ids are unique and equal the vanilla id set.
 *   2. Every row's entry toggles iff the row is a non-passive aura (holds exactly in vanilla).
 *   3. Rows holding their own skill carry that skill's vanilla entry (apart from id).
 *      Substitute rows (a dropped skill running another skill's mechanics, incl. Race
 *      Mode's Prayer filler) carry the entry of the skill whose mechanics they copied.
 */
import AdmZip from 'adm-zip';
import fs from 'fs';
import path from 'path';
import { isDeepStrictEqual } from 'util';

const arg = name => {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
};
const BASE = arg('--base') ?? 'http://localhost:3000';
const BASELINE = arg('--baseline');
const SAVE = arg('--save');
const JSON_PATH = 'data/hd/global/excel/controllerskillsettings.json';

const CASES = [
  ...[101, 202, 303, 7, 42, 1337, 9001, 31337, 555, 8080, 2024, 77777].map(seed => ({
    name: `s${seed}`, body: { seed, raceMode: false }, query: `seed=${seed}&raceMode=0`,
  })),
  { name: 'race404', body: { seed: 404 }, query: 'seed=404' },
  // Challenge 16 runs Forgotten Arts.
  { name: 'fa16', body: { seed: 505, weeklyChallenge: { enabled: true, weekOverride: 16 } }, query: 'seed=505&weekly=1&weekOverride=16' },
];

function parseTxt(txt) {
  const [headers, ...rows] = txt.replace(/\r?\n$/, '').split(/\r?\n/).map(l => l.split('\t'));
  return { headers, rows, col: name => headers.indexOf(name) };
}

const vanillaSkills = parseTxt(fs.readFileSync('data/txt/skills.txt', 'utf8'));
const vanillaSettings = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
const vanillaEntries = vanillaSettings.controllerskilldata;
const vanillaIds = new Set(vanillaEntries.map(e => e.id));
const vanillaEntryByName = new Map(vanillaEntries.map(e => [vanillaSkills.rows[e.id][0], e]));

// Columns a substitute copies from its source and no writer or mutation touches afterwards
// (srvstfunc and aurastate are left out: Smite and Holy Shield get them rewritten cross-class).
const MECHANICS = ['srvdofunc', 'cltstfunc', 'cltdofunc', 'srvmissile', 'srvmissilea',
  'cltmissile', 'cltmissilea', 'aura', 'passive', 'summon', 'pettype'];
const mechanicsKey = (table, row) => MECHANICS.map(c => row[table.col(c)] ?? '').join('|');
const vanillaByMechanics = new Map();
for (const e of vanillaEntries) {
  const key = mechanicsKey(vanillaSkills, vanillaSkills.rows[e.id]);
  if (!vanillaByMechanics.has(key)) vanillaByMechanics.set(key, []);
  vanillaByMechanics.get(key).push(e);
}

const stripId = e => { const { id: _id, name: _name, ...rest } = e; return rest; };

async function generate(c) {
  for (;;) {
    const res = await fetch(`${BASE}/api/randomize`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(c.body),
    });
    if (res.status === 429 || res.status === 503) {
      const wait = Number(res.headers.get('retry-after')) || 10;
      console.log(`  ${c.name}: ${res.status}, retrying in ${wait}s`);
      await new Promise(r => setTimeout(r, wait * 1000));
      continue;
    }
    if (!res.ok) throw new Error(`randomize ${c.name}: ${res.status} ${await res.text()}`);
    break;
  }
  const dl = await fetch(`${BASE}/api/download?${c.query}`);
  if (!dl.ok) throw new Error(`download ${c.name}: ${dl.status} ${await dl.text()}`);
  return Buffer.from(await dl.arrayBuffer());
}

let failures = 0;
const fail = (c, msg) => { failures++; console.log(`  FAIL ${c.name}: ${msg}`); };
const examples = [];

for (const c of CASES) {
  const buf = await generate(c);
  if (SAVE) { fs.mkdirSync(SAVE, { recursive: true }); fs.writeFileSync(path.join(SAVE, `${c.name}.zip`), buf); }
  const zip = new AdmZip(buf);
  const entries = zip.getEntries();
  const find = suffix => entries.find(e => e.entryName.endsWith(suffix));

  const jsonEntry = find('/data/hd/global/excel/controllerskillsettings.json');
  if (!jsonEntry) { fail(c, 'controllerskillsettings.json missing'); continue; }
  const settings = JSON.parse(jsonEntry.getData().toString('utf8'));
  const skills = parseTxt(find('/data/global/excel/skills.txt').getData().toString('utf8'));

  // 1. id set
  const ids = settings.controllerskilldata.map(e => e.id);
  if (new Set(ids).size !== ids.length) fail(c, 'duplicate ids');
  if (ids.length !== vanillaIds.size || !ids.every(id => vanillaIds.has(id))) fail(c, 'id set differs from vanilla');

  let own = 0, subs = 0;
  for (const e of settings.controllerskilldata) {
    const row = skills.rows[e.id];
    const name = row[0];

    // 2. aura toggle invariant
    const isToggleAura = row[skills.col('aura')] === '1' && row[skills.col('passive')] !== '1';
    if (e.toggleSlotState !== isToggleAura) fail(c, `row ${e.id} ${name}: toggleSlotState=${e.toggleSlotState}, aura=${isToggleAura}`);

    // 3. entry matches the skill in the row
    // (A substitute keeps its own name, so an entry that isn't the row's own skill must
    // match a skill with the row's mechanics.)
    const vanillaOwn = vanillaEntryByName.get(name);
    if (vanillaOwn && isDeepStrictEqual(stripId(e), stripId(vanillaOwn))) {
      own++;
      if (e.name !== vanillaOwn.name) fail(c, `row ${e.id} ${name}: name ${e.name}, expected ${vanillaOwn.name}`);
    } else {
      subs++;
      const sources = vanillaByMechanics.get(mechanicsKey(skills, row)) ?? [];
      if (!sources.some(s => isDeepStrictEqual(stripId(e), stripId(s)))) {
        fail(c, `substitute row ${e.id} ${name}: entry matches none of [${sources.map(s => s.name).join(', ')}]`);
      }
    }

    // Collect in-game test cases: a relocated skill sitting in a row that used to toggle
    // or need a corpse, which is where the old mapping broke.
    const old = vanillaEntries.find(v => v.id === e.id);
    if (!c.name.startsWith('race') && examples.length < 12 && vanillaOwn?.id !== e.id
      && (old.toggleSlotState || old.targetGroup === 1) && !e.toggleSlotState && e.targetGroup !== 1) {
      examples.push(`${c.name}: ${name} (${row[skills.col('charclass')]}) in row ${e.id}, formerly ${old.name}`);
    }
  }

  // Baseline: every other file byte-identical
  let diffs = 0;
  if (BASELINE) {
    const basePath = path.join(BASELINE, `${c.name}.zip`);
    if (!fs.existsSync(basePath)) {
      console.log(`  (no baseline for ${c.name})`);
    } else {
      const base = new AdmZip(basePath);
      const baseNames = new Set(base.getEntries().map(e => e.entryName));
      for (const e of entries) {
        if (e === jsonEntry || e.isDirectory) continue;
        const b = base.getEntry(e.entryName);
        if (!b) { diffs++; fail(c, `new file vs baseline: ${e.entryName}`); continue; }
        baseNames.delete(e.entryName);
        if (!e.getData().equals(b.getData())) { diffs++; fail(c, `differs from baseline: ${e.entryName}`); }
      }
      for (const n of baseNames) if (!n.endsWith('/')) { diffs++; fail(c, `missing vs baseline: ${n}`); }
    }
  }

  console.log(`${c.name}: ${ids.length} entries (${own} own, ${subs} substitute)${BASELINE ? `, ${diffs} baseline diffs` : ''}`);
}

console.log('\nIn-game test candidates (relocated skill in a former toggle/corpse row):');
for (const x of examples) console.log(`  ${x}`);
console.log(failures === 0 ? '\nPASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
