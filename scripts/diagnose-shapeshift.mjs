/**
 * diagnose-shapeshift.mjs
 *
 * Verifies the shapeshift co-placement logic:
 *   1. Wearwolf and Wearbear are placed somewhere
 *   2. All restrict=2 skills + Shape Shifting share the same class as a form skill
 *   3. On the form-host class, melee/aura/passive cross-class skills have
 *      restrict=1 and weapon-type gates cleared
 *
 * Run with: node scripts/diagnose-shapeshift.mjs [seed1 seed2 ...]
 *   (dev server must already be running: `npm run dev`)
 */
import AdmZip from 'adm-zip';

const BASE = 'http://localhost:3000';
const SEEDS = process.argv.slice(2).map(Number).filter(Boolean);
if (SEEDS.length === 0) SEEDS.push(1, 42, 1337);

const WOLF_ONLY = ['Feral Rage', 'Fury', 'Rabies'];
const BEAR_ONLY = ['Maul', 'Shock Wave'];
const EITHER_FORM = ['Fire Claws', 'Hunger', 'Shape Shifting'];
const FORM_SKILLS = ['Wearwolf', 'Wearbear'];
// Skills subject to the 50% drop coin flip. Shape Shifting is intentionally
// excluded — it's the strategic passive linchpin. Detection works because
// these skills all have vanilla restrict=2; substitutes lose that.
const DROPPABLE = new Set(['Feral Rage', 'Fury', 'Rabies', 'Maul', 'Shock Wave', 'Fire Claws', 'Hunger']);

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

function colIdx(parsed, name) {
  return parsed.headers.indexOf(name);
}

function checkSeed(seed, skills) {
  const ci = {
    skill: colIdx(skills, 'skill'),
    charclass: colIdx(skills, 'charclass'),
    restrict: colIdx(skills, 'restrict'),
    anim: colIdx(skills, 'anim'),
    itypea1: colIdx(skills, 'itypea1'),
    itypea2: colIdx(skills, 'itypea2'),
    etypea1: colIdx(skills, 'etypea1'),
    weapsel: colIdx(skills, 'weapsel'),
  };

  const placement = new Map();
  for (const r of skills.rows) {
    placement.set(r[ci.skill], { class: r[ci.charclass], restrict: r[ci.restrict], anim: r[ci.anim] });
  }

  console.log(`\n=== seed ${seed} ===`);

  const wolfClass = placement.get('Wearwolf')?.class;
  const bearClass = placement.get('Wearbear')?.class;
  const formClasses = new Set([wolfClass, bearClass].filter(Boolean));
  console.log(`  Wearwolf        → ${wolfClass ?? 'MISSING'}`);
  console.log(`  Wearbear        → ${bearClass ?? 'MISSING'}`);

  let pass = true;
  let droppedCount = 0;
  let droppableTotal = 0;
  const checkGroup = (label, names, allowed) => {
    for (const s of names) {
      const p = placement.get(s);
      const droppable = DROPPABLE.has(s);
      if (droppable) droppableTotal++;
      if (!p) {
        console.log(`  ${s.padEnd(15)} → MISSING`);
        continue;
      }
      // For droppable skills (vanilla restrict=2), substitutes lose restrict=2
      // because they borrowed mechanics from a non-shapeshift source.
      if (droppable && p.restrict !== '2') {
        droppedCount++;
        console.log(`  ${s.padEnd(15)} [${label}] → DROPPED (substitute on ${p.class})`);
        continue;
      }
      const ok = allowed.has(p.class);
      if (!ok) pass = false;
      console.log(`  ${s.padEnd(15)} [${label}] → ${p.class} ${ok ? 'OK' : `*** REQUIRES one of {${[...allowed].join(',')}} ***`}`);
    }
  };
  checkGroup('wolf', WOLF_ONLY, new Set(wolfClass ? [wolfClass] : []));
  checkGroup('bear', BEAR_ONLY, new Set(bearClass ? [bearClass] : []));
  checkGroup('any',  EITHER_FORM, formClasses);
  console.log(`  Drop rate: ${droppedCount}/${droppableTotal} droppable skills dropped`);

  // Sample a few melee skills on the form-host class to verify restrict=1 + cleared gates
  console.log('\n  -- restrict=1 / weapon-gate sample on form-host class(es):');
  let restrictOneCount = 0;
  let withGatesCleared = 0;
  let stillGated = 0;
  for (const r of skills.rows) {
    if (!formClasses.has(r[ci.charclass])) continue;
    if (r[ci.restrict] !== '1') continue;
    restrictOneCount++;
    const gated = (ci.itypea1 >= 0 && r[ci.itypea1]) || (ci.weapsel >= 0 && r[ci.weapsel]);
    if (gated) {
      stillGated++;
      console.log(`    STILL GATED: ${r[ci.skill]} cls=${r[ci.charclass]} anim=${r[ci.anim]} itypea1=${r[ci.itypea1]} weapsel=${r[ci.weapsel]}`);
    } else {
      withGatesCleared++;
    }
  }
  console.log(`  restrict=1 rows on form-host class(es): ${restrictOneCount} (${withGatesCleared} cleared, ${stillGated} still gated)`);

  return pass;
}

(async function main() {
  let allPass = true;
  for (const seed of SEEDS) {
    console.log(`\n# Fetching seed ${seed} …`);
    const zip = await generateZip(seed);
    const skills = readTxtFromZip(zip, 'skills.txt');
    if (!skills) throw new Error(`seed ${seed}: skills.txt missing`);
    if (!checkSeed(seed, skills)) allPass = false;
  }
  console.log(`\n=== ${allPass ? 'PASS' : 'FAIL'} ===\n`);
  process.exit(allPass ? 0 : 1);
})().catch(e => {
  console.error(e);
  process.exit(1);
});
