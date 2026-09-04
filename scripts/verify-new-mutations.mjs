/**
 * verify-new-mutations.mjs — Exercises Molasses, No Guard, Court of Kings and
 * Band of Brothers against the real data/txt tables and asserts their effects.
 *
 * Unlike the older verify scripts, this one does NOT mirror the mutation logic:
 * it compiles the actual TypeScript modules to a temp dir and runs those, so the
 * assertions cannot silently drift from the shipped implementation.
 *
 * Run with: node scripts/verify-new-mutations.mjs
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const TXT = path.join(ROOT, 'data', 'txt');

const SRC = [
  'src/lib/randomizer/mutations/molasses.ts',
  'src/lib/randomizer/mutations/no-guard.ts',
  'src/lib/randomizer/mutations/court-of-kings.ts',
  'src/lib/randomizer/mutations/band-of-brothers.ts',
  'src/lib/mutations/registry.ts',
];

let failures = 0;
let checks = 0;
function check(label, cond, detail) {
  checks++;
  const suffix = detail ? '  ' + detail : '';
  if (cond) {
    console.log('  ok   ' + label + suffix);
    return;
  }
  failures++;
  console.log('  FAIL ' + label + suffix);
}

function loadTxt(name) {
  const raw = fs.readFileSync(path.join(TXT, name), 'utf-8');
  const lines = raw.split(/\r?\n/).filter((l, i) => i === 0 || l.length > 0);
  return {
    headers: lines[0].split('\t'),
    rows: lines.slice(1).map(l => l.split('\t')),
  };
}

const col = (t, name) => t.headers.indexOf(name);
const num = (v) => {
  const n = parseInt(v, 10);
  return isNaN(n) ? null : n;
};

// tsc exits non-zero on a pre-existing '@/lib' path-alias error in the
// transitively included index.ts, but still emits every file we need — so the
// build status is ignored and the emitted artifacts are what matter.
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mutverify-'));
try {
  execFileSync('npx', ['tsc', '--module', 'commonjs', '--target', 'es2022',
    '--moduleResolution', 'node', '--skipLibCheck', '--outDir', outDir,
    '--rootDir', 'src', ...SRC], { cwd: ROOT, stdio: 'pipe', shell: true });
} catch {
  /* emit-on-error is expected */
}

const req = createRequire(import.meta.url);
const load = (p) => req(path.join(outDir, p));

const { applyMolasses } = load('lib/randomizer/mutations/molasses.js');
const { applyNoGuard, NO_GUARD_EXCLUDED_SKILLS } = load('lib/randomizer/mutations/no-guard.js');
const { applyCourtOfKings } = load('lib/randomizer/mutations/court-of-kings.js');
const { applyBandOfBrothers } = load('lib/randomizer/mutations/band-of-brothers.js');
const registry = load('lib/mutations/registry.js');

// ── Molasses ──────────────────────────────────────────────────────────────
console.log('\nMolasses');
{
  const monstats = loadTxt('monstats.txt');
  const before = monstats.rows.map(r => [...r]);
  const vI = col(monstats, 'Velocity');
  const rI = col(monstats, 'Run');
  const dMinI = col(monstats, 'A1MinD');
  const dMaxI = col(monstats, 'A1MaxD');
  const find = (id) => monstats.rows.findIndex(r => r[0] === id);

  applyMolasses({ monstats });

  const bab = find('baboon1');
  check('fast monster halves',
    num(monstats.rows[bab][rI]) === Math.round(num(before[bab][rI]) * 0.5),
    'baboon1 Run ' + before[bab][rI] + ' -> ' + monstats.rows[bab][rI]);

  const zom = find('zombie1');
  check('slow monster floors at 1, never 0',
    num(monstats.rows[zom][vI]) >= 1,
    'zombie1 Velocity ' + before[zom][vI] + ' -> ' + monstats.rows[zom][vI]);

  // Vanilla already ships ~190 zero cells for immobile monsters (statues,
  // turret-likes), and the mutation skips val <= 0 — so the assertion is that
  // nothing which COULD move was frozen, not that no zeros exist.
  let frozen = 0;
  for (let k = 0; k < monstats.rows.length; k++) {
    for (const i of [vI, rI]) {
      if ((num(before[k][i]) ?? 0) > 0 && num(monstats.rows[k][i]) === 0) frozen++;
    }
  }
  check('no moving monster frozen to Velocity/Run 0', frozen === 0, frozen + ' newly frozen cells');

  const spreadOk = monstats.rows.every((r, i) => {
    const bMin = num(before[i][dMinI]);
    const bMax = num(before[i][dMaxI]);
    const aMin = num(r[dMinI]);
    const aMax = num(r[dMaxI]);
    if (!bMin || !bMax || bMin <= 0 || bMax <= 0 || aMin === null) return true;
    return (aMax - aMin) === (bMax - bMin);
  });
  check('damage spread preserved', spreadOk);

  const dia = find('diablo');
  check('damage doubled on a boss',
    num(monstats.rows[dia][dMinI]) === num(before[dia][dMinI]) * 2,
    'diablo A1MinD ' + before[dia][dMinI] + ' -> ' + monstats.rows[dia][dMinI]);

  const changed = monstats.rows.filter((r, i) => r[vI] !== before[i][vI]).length;
  check('act guard limited the blast radius', changed > 100 && changed < monstats.rows.length,
    changed + ' of ' + monstats.rows.length + ' rows had Velocity changed');
}

// ── No Guard ──────────────────────────────────────────────────────────────
console.log('\nNo Guard');
{
  const armor = loadTxt('armor.txt');
  const before = armor.rows.map(r => [...r]);
  const minI = col(armor, 'minac');
  const blockI = col(armor, 'block');

  const monstats = loadTxt('monstats.txt');
  const monBefore = monstats.rows.map(r => [...r]);
  const acI = col(monstats, 'AC');
  const acHI = col(monstats, 'AC(H)');
  const tcI = col(monstats, 'TreasureClass');

  applyNoGuard({ armor, monstats });

  const hadDefense = before.filter(r => r[0] && num(r[minI]) > 0).length;
  const stillHas = armor.rows.filter(r => r[0] && num(r[minI]) > 0).length;
  check('all armor defense zeroed', stillHas === 0,
    hadDefense + ' rows had defense, ' + stillHas + ' remain');

  check('block values untouched', armor.rows.every((r, i) => r[blockI] === before[i][blockI]));

  const actMon = monstats.rows
    .map((r, i) => i)
    .filter(i => /^Act (\d)/.test(monBefore[i][tcI] ?? ''));
  // A handful of rows ship a blank AC cell, which the game reads as 0 — the
  // mutation leaves those alone, so treat blank as already zeroed.
  const zeroAc = (v) => (num(v) ?? 0) === 0;
  check('act monsters lose all defense',
    actMon.every(i => zeroAc(monstats.rows[i][acI]) && zeroAc(monstats.rows[i][acHI])),
    actMon.length + ' act-treasure-class monsters checked');

  const acChanged = monstats.rows.filter((r, i) => r[acI] !== monBefore[i][acI]).length;
  check('act guard limited the blast radius', acChanged > 100 && acChanged < monstats.rows.length,
    acChanged + ' of ' + monstats.rows.length + ' rows had AC changed');

  const golem = monstats.rows.findIndex(r => r[0] === 'bloodgolem');
  check('player summons keep their defense',
    golem === -1 || monstats.rows[golem][acI] === monBefore[golem][acI],
    golem === -1 ? 'bloodgolem row not found' : 'bloodgolem AC ' + monstats.rows[golem][acI]);

  const skills = loadTxt('skills.txt');
  const names = new Set(skills.rows.map(r => r[0]));
  const missing = [...NO_GUARD_EXCLUDED_SKILLS].filter(n => !names.has(n));
  check('every excluded skill name exists in skills.txt', missing.length === 0,
    missing.length ? 'missing: ' + missing.join(', ') : NO_GUARD_EXCLUDED_SKILLS.size + ' names verified');

  check('Wearbear (form anchor) not excluded', !NO_GUARD_EXCLUDED_SKILLS.has('Wearbear'));
  check('absorb skills not excluded',
    !NO_GUARD_EXCLUDED_SKILLS.has('Bone Armor') && !NO_GUARD_EXCLUDED_SKILLS.has('Energy Shield'));
}

// ── Court of Kings ────────────────────────────────────────────────────────
console.log('\nCourt of Kings');
{
  const levels = loadTxt('levels.txt');
  const before = levels.rows.map(r => [...r]);
  const uMaxI = col(levels, 'MonUMax');
  const denI = col(levels, 'MonDen');

  applyCourtOfKings({ levels });

  const zerosKept = levels.rows.every((r, i) =>
    (num(before[i][uMaxI]) ?? 0) > 0 || r[uMaxI] === before[i][uMaxI]);
  check('areas with 0 specials stay at 0', zerosKept);

  const denZerosKept = levels.rows.every((r, i) =>
    num(before[i][denI]) !== 0 || r[denI] === before[i][denI]);
  check('scripted MonDen=0 areas stay at 0', denZerosKept);

  check('special pack count capped at 6', levels.rows.every(r => (num(r[uMaxI]) ?? 0) <= 6));

  const s = levels.rows.findIndex(r => r[0] === 'Act 1 - Wilderness 2');
  check('typical area tripled',
    num(levels.rows[s][uMaxI]) === Math.min(6, num(before[s][uMaxI]) * 3),
    'Wilderness 2 UMax ' + before[s][uMaxI] + ' -> ' + levels.rows[s][uMaxI]);
  check('typical area density cut to 65%',
    num(levels.rows[s][denI]) === Math.round(num(before[s][denI]) * 0.65),
    'MonDen ' + before[s][denI] + ' -> ' + levels.rows[s][denI]);
}

// ── Band of Brothers ──────────────────────────────────────────────────────
console.log('\nBand of Brothers');
{
  const hireling = loadTxt('hireling.txt');
  const charstats = loadTxt('charstats.txt');
  const hBefore = hireling.rows.map(r => [...r]);
  const cBefore = charstats.rows.map(r => [...r]);
  const hpI = col(hireling, 'HP');
  const dmgLvlI = col(hireling, 'Dmg/Lvl');
  const lvl1I = col(hireling, 'Level1');
  const skillI = col(hireling, 'Skill1');
  const vitI = col(charstats, 'LifePerVitality');

  applyBandOfBrothers({ hireling, charstats });

  const i = hireling.rows.findIndex(r => r[0] && num(r[hpI]) > 0);
  check('merc HP scaled 2.5x',
    num(hireling.rows[i][hpI]) === Math.round(num(hBefore[i][hpI]) * 2.5),
    'HP ' + hBefore[i][hpI] + ' -> ' + hireling.rows[i][hpI]);

  const j = hireling.rows.findIndex(r => r[0] && num(r[dmgLvlI]) > 0);
  check('merc Dmg/Lvl scaled (keeps late-game relevance)',
    num(hireling.rows[j][dmgLvlI]) === Math.round(num(hBefore[j][dmgLvlI]) * 2.5),
    'Dmg/Lvl ' + hBefore[j][dmgLvlI] + ' -> ' + hireling.rows[j][dmgLvlI]);

  check('merc skill NAMES untouched (no new crash surface)',
    hireling.rows.every((r, k) => r[skillI] === hBefore[k][skillI]));

  check('merc skill levels raised',
    hireling.rows.some((r, k) => (num(r[lvl1I]) ?? 0) > (num(hBefore[k][lvl1I]) ?? 0)));

  const vitOk = charstats.rows.every((r, k) => {
    const b = num(cBefore[k][vitI]);
    if (!b || b <= 0) return true;
    return num(r[vitI]) === Math.round(b * 0.75);
  });
  const sorc = charstats.rows.findIndex(r => r[0] === 'Sorceress');
  check('LifePerVitality cut to 75%', vitOk,
    'sorceress ' + cBefore[sorc][vitI] + ' -> ' + charstats.rows[sorc][vitI]);

  const allInt = charstats.rows.every(r => !/^\d+\.\d+$/.test(r[vitI] ?? ''))
    && hireling.rows.every(r => !/^\d+\.\d+$/.test(r[hpI] ?? ''));
  check('no fractional cells written', allInt);
}

// ── Conflict guard ────────────────────────────────────────────────────────
console.log('\nConflict guard');
{
  const { assertNoConflictingMutations, EXCLUSIVE_MUTATION_PAIRS, WEEKLY_MUTATIONS } = registry;

  let threw = false;
  try { assertNoConflictingMutations([15, 1]); } catch { threw = true; }
  check('conflicting pair throws (Molasses + Hyperdrive)', threw);

  let passed = true;
  try { assertNoConflictingMutations([15, 5]); } catch { passed = false; }
  check('non-conflicting pair passes', passed);

  let badSlot = null;
  WEEKLY_MUTATIONS.forEach((ids, idx) => {
    try {
      assertNoConflictingMutations(ids);
    } catch {
      if (badSlot === null) badSlot = idx;
    }
  });
  check('every existing rotation slot is conflict-free', badSlot === null,
    badSlot === null ? WEEKLY_MUTATIONS.length + ' slots checked' : 'slot ' + badSlot + ' conflicts');

  check('exclusion pairs registered', EXCLUSIVE_MUTATION_PAIRS.length === 5);
}

// ── Rotation shape ────────────────────────────────────────────────────────
console.log('\nRotation');
{
  const { WEEKLY_MUTATIONS, WEEK_NAMES, MUTATIONS } = registry;

  check('every slot has a name', WEEKLY_MUTATIONS.length === WEEK_NAMES.length,
    WEEKLY_MUTATIONS.length + ' slots, ' + WEEK_NAMES.length + ' names');

  check('every slot id resolves to a mutation',
    WEEKLY_MUTATIONS.every(ids => ids.every(id => MUTATIONS[id])));

  // Slots 0-11 are challenges 1-12, already played. The archive renders them
  // from this table, so a change here silently rewrites history.
  const PLAYED = [[5,7],[8,13],[1,6],[2,10],[4,5],[7,13],[3,5],[8,11,9],[2,13,12],[9,3,14],[3,13,8],[14,7,2]];
  check('played slots 0-11 are unchanged',
    JSON.stringify(WEEKLY_MUTATIONS.slice(0, 12)) === JSON.stringify(PLAYED));

  const dupes = [];
  for (let a = 0; a < WEEKLY_MUTATIONS.length; a++) {
    for (let b = a + 1; b < WEEKLY_MUTATIONS.length; b++) {
      const x = [...WEEKLY_MUTATIONS[a]].sort((m, n) => m - n).join(',');
      const y = [...WEEKLY_MUTATIONS[b]].sort((m, n) => m - n).join(',');
      if (x === y) dupes.push(a + '/' + b);
    }
  }
  check('no two slots run the same combination', dupes.length === 0,
    dupes.length ? 'duplicates at ' + dupes.join(' ') : WEEKLY_MUTATIONS.length + ' unique combos');

  const names = new Set(WEEK_NAMES);
  check('no two slots share a name', names.size === WEEK_NAMES.length);

  // No mutation should carry a disproportionate share of the rotation — the
  // pre-2026 table ran 3-9 appearances, which made some weeks feel repetitive.
  const usage = new Map();
  for (const ids of WEEKLY_MUTATIONS) {
    for (const id of ids) usage.set(id, (usage.get(id) ?? 0) + 1);
  }
  const counts = [...usage.values()];
  const lo = Math.min(...counts);
  const hi = Math.max(...counts);
  check('every mutation appears at least twice', lo >= 2, 'least-used appears ' + lo + 'x');
  check('usage spread is 3 or less', hi - lo <= 3, 'range ' + lo + '-' + hi + ', spread ' + (hi - lo));
  check('all 18 mutations are in the rotation', usage.size === Object.keys(MUTATIONS).length,
    usage.size + ' of ' + Object.keys(MUTATIONS).length + ' used');
}

console.log('\n' + (checks - failures) + '/' + checks + ' checks passed');
process.exit(failures === 0 ? 0 : 1);
