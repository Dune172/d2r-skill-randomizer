/**
 * verify-hardcoded-pin.mjs
 *
 * Verifies the HARDCODED_CLASS_SKILLS probabilistic-pin implementation in
 * src/lib/randomizer/skill-placer.ts by driving the running Next.js dev
 * server (preview_start launches it on :3000).
 *
 * Run with: node scripts/verify-hardcoded-pin.mjs
 *
 * Checks:
 *   1. Per seed: each hardcoded skill either appears on its native class
 *      or is absent entirely (never on a non-native class).
 *   2. Determinism: the same seed produces byte-identical skills.txt twice.
 *   3. Bias: across N seeds, each hardcoded skill appears ≈50% of the time.
 */
import AdmZip from 'adm-zip';
import crypto from 'crypto';

const BASE = 'http://localhost:3000';

const HARDCODED = {
  'Leap': 'bar',
  'Leap Attack': 'bar',
  'Whirlwind': 'bar',
  'Dragon Flight': 'ass',
  'Fend': 'ama',
  'Inferno': 'sor',
  'Arctic Blast': 'dru',
};

async function generateAndFetch(seed) {
  const rand = await fetch(`${BASE}/api/randomize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ seed }),
  });
  if (!rand.ok) throw new Error(`randomize ${seed}: ${rand.status} ${await rand.text()}`);

  const dl = await fetch(`${BASE}/api/download?seed=${seed}`);
  if (!dl.ok) throw new Error(`download ${seed}: ${dl.status} ${await dl.text()}`);

  const buf = Buffer.from(await dl.arrayBuffer());
  const zip = new AdmZip(buf);

  const entries = zip.getEntries();
  const skillsEntry = entries.find(e => e.entryName.endsWith('skills.txt'));
  if (!skillsEntry) throw new Error(`no skills.txt in zip for seed ${seed}`);
  return skillsEntry.getData().toString('utf-8');
}

function parseSkillsTxt(txt) {
  const lines = txt.split(/\r?\n/);
  const headers = lines[0].split('\t');
  const nameIdx = headers.indexOf('skill');
  const classIdx = headers.indexOf('charclass');
  if (nameIdx === -1 || classIdx === -1) {
    throw new Error(`missing skill/charclass columns. Got: ${headers.slice(0, 5).join(',')}`);
  }
  // skill name → Set<charclass values it appears under>
  const skillToClasses = new Map();
  // Also count rows with non-empty charclass (to confirm ~240)
  let filled = 0;
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split('\t');
    if (cols.length < Math.max(nameIdx, classIdx) + 1) continue;
    const name = cols[nameIdx];
    const cc = cols[classIdx];
    if (!name || !cc) continue;
    filled++;
    if (!skillToClasses.has(name)) skillToClasses.set(name, new Set());
    skillToClasses.get(name).add(cc);
  }
  return { skillToClasses, filled };
}

function check1_perSeed(seed, parsed) {
  const issues = [];
  for (const [skill, native] of Object.entries(HARDCODED)) {
    const classes = parsed.skillToClasses.get(skill);
    if (!classes) continue; // absent → OK
    for (const cc of classes) {
      if (cc !== native) {
        issues.push(`seed ${seed}: ${skill} appeared on ${cc}, expected only ${native}`);
      }
    }
  }
  return issues;
}

function sha(s) {
  return crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);
}

async function main() {
  console.log('=== Test 1 & 3: Native-class-only + ~50% bias over 100 seeds ===');
  const appearances = Object.fromEntries(Object.keys(HARDCODED).map(k => [k, 0]));
  const N = 100;
  let allIssues = [];
  for (let seed = 1; seed <= N; seed++) {
    const txt = await generateAndFetch(seed);
    const parsed = parseSkillsTxt(txt);
    if (seed === 1) console.log(`  skills.txt rows with charclass (seed 1): ${parsed.filled}`);

    const issues = check1_perSeed(seed, parsed);
    if (issues.length) allIssues.push(...issues);

    for (const name of Object.keys(HARDCODED)) {
      if (parsed.skillToClasses.has(name)) appearances[name]++;
    }
    if (seed % 10 === 0) process.stdout.write(`  ${seed}/${N}\r`);
  }
  console.log(`  Done.                                   `);

  if (allIssues.length === 0) {
    console.log('  [OK] Test 1: every hardcoded skill appeared only on its native class (or was absent).');
  } else {
    console.log('  [FAIL] Test 1:');
    for (const i of allIssues.slice(0, 20)) console.log('    ' + i);
    if (allIssues.length > 20) console.log(`    …and ${allIssues.length - 20} more`);
  }

  console.log('\n  Bias check — appearances out of ' + N + ' seeds (expect ~50):');
  for (const [skill, count] of Object.entries(appearances)) {
    const pct = (count / N * 100).toFixed(0);
    const flag = (count < 30 || count > 70) ? ' <-- SKEW' : '';
    console.log(`    ${skill.padEnd(16)} ${String(count).padStart(3)}/${N}  (${pct}%)${flag}`);
  }

  console.log('\n=== Test 2: Determinism — seed 42 run twice ===');
  const a = await generateAndFetch(42);
  const b = await generateAndFetch(42);
  if (sha(a) === sha(b)) {
    console.log(`  [OK] Both runs produced identical skills.txt (sha256:${sha(a)})`);
  } else {
    console.log(`  [FAIL] skills.txt differs: ${sha(a)} vs ${sha(b)}`);
  }

  const failed = allIssues.length > 0 || sha(a) !== sha(b);
  process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error('FATAL:', e); process.exit(2); });
