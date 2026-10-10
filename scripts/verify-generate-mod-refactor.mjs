/**
 * verify-generate-mod-refactor.mjs
 *
 * Determinism fixture for src/lib/randomizer/generate-mod.ts.
 *
 * The randomization pipeline was moved out of src/app/api/randomize/route.ts verbatim.
 * That is only safe if the output is byte-identical, and the thing that can silently
 * break it is RNG CONSUMPTION ORDER: `rng` flows through runPlacement ->
 * updateSkillsSynergies -> updateSkillDescSynergies -> the StartSkill pick. Reorder
 * any of those and every seed changes.
 *
 * So: capture BEFORE changing the pipeline's structure, verify after.
 *
 *   node scripts/verify-generate-mod-refactor.mjs --capture   # snapshot current output
 *   node scripts/verify-generate-mod-refactor.mjs             # assert unchanged
 *
 * Requires a COLD-cache dev server: `node scripts/dev-cold-cache.mjs` (port 3210).
 *
 * Capture and verify in the same season: mods carry the seasonal town overlay for the
 * current month, so a fixture captured in October will not match one verified in December.
 *
 * We hash EACH ZIP ENTRY'S CONTENT, sorted by name -- not the zip bytes. `archiver`
 * embeds mtimes, so whole-file hashes are not stable across runs. Per-entry hashes
 * also mean a failure names the exact file that drifted.
 *
 * The .lnk is added by /api/download, not by the pipeline, and is included deliberately:
 * it carries the mod name and race-mode map seed, which the pipeline's caller decides.
 */
import AdmZip from 'adm-zip';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import ts from 'typescript';

const require = createRequire(import.meta.url);

const BASE = process.env.D2RR_BASE || 'http://localhost:3210';
const FIXTURE = path.join(import.meta.dirname, 'fixtures', 'zip-entry-hashes.json');
const CAPTURE = process.argv.includes('--capture');
const ALLOW_WARM = process.argv.includes('--allow-warm-cache');

/**
 * Tuple specs. ONE source of truth per case: buildTuple() derives both the POST
 * body and the GET query from the same spec, applying the same "effective value"
 * normalization the two routes apply internally. If these drifted apart the
 * download would 404 on a cache-key miss rather than fail loudly, so they are
 * deliberately never written by hand.
 *
 * raceMode is spelled out on EVERY tuple: both endpoints default it to TRUE, and
 * race mode replaces 7 of 8 classes with Prayer filler -- a silent default here
 * would make most of these tuples exercise the same narrow path.
 */
const SPECS = [
  { name: 'baseline',            seed: 1 },
  { name: 'baseline-alt-seed',   seed: 123456789 },
  { name: 'baseline-seed-zero',  seed: 0 },
  { name: 'no-prereqs',          seed: 42,    enablePrereqs: false },
  { name: 'race-mode',           seed: 42,    raceMode: true },
  { name: 'players-3-all-acts',  seed: 777,   players: 3 },
  { name: 'players-8-acts-1-2',  seed: 777,   players: 8, acts: [1, 2] },
  { name: 'hireling-aura-off',   seed: 2024,  hirelingAura: false },
  { name: 'disable-chat',        seed: 2024,  disableChat: true },
  { name: 'horadric-cube',       seed: 31337, cube: true },
  { name: 'staff-lvl1',          seed: 31337, staff: 1 },
  { name: 'staff-lvl20-noSpeed', seed: 31337, staff: 20, staffSpeed: false },
  { name: 'staff-blood-raven',   seed: 8,     staff: 5, dropSource: 'Blood Raven' },
  { name: 'xp-2x',               seed: 555,   xpMultiplier: 2 },
  { name: 'xp-3x-acts-nm-hell',  seed: 555,   xpMultiplier: 3, xpActs: [1, 5], xpDifficulties: [2, 3] },
  { name: 'weekly-w1',           seed: 99,    weekly: 1 },
  { name: 'weekly-w7',           seed: 99,    weekly: 7 },
  { name: 'weekly-w12-mystery',  seed: 99,    weekly: 12 },
  { name: 'weekly-w14',          seed: 4321,  weekly: 14 },
  { name: 'weekly-w15-shuffle3', seed: 4321,  weekly: 15 },
  { name: 'weekly-w16',          seed: 4321,  weekly: 16 },
  { name: 'weekly-w17',          seed: 4321,  weekly: 17 },
  { name: 'weekly-w18',          seed: 4321,  weekly: 18 },
  { name: 'weekly-w19',          seed: 4321,  weekly: 19 },
  { name: 'weekly-w20',          seed: 4321,  weekly: 20 },
  { name: 'weekly-w21',          seed: 4321,  weekly: 21 },
  { name: 'enemy-shuffle',       seed: 808,   enemyShuffle: true },
  { name: 'enemy-shuffle-p4-xp', seed: 809,   enemyShuffle: true, players: 4, xpMultiplier: 2 },
  { name: 'race-mode-no-aura',   seed: 43,    raceMode: true, hirelingAura: false },
  { name: 'class-build-sor',     build: { cls: 'sor', seed: 1001, pages: [2, 7, 9], fill: 77 } },
  { name: 'class-build-war',     build: { cls: 'war', seed: 1008, pages: [23, 4, 6], fill: 84 } },
  { name: 'kitchen-sink',        seed: 6969,  enablePrereqs: false, players: 5, acts: [2, 3, 4],
                                 staff: 10, dropSource: 'Blood Raven', cube: true,
                                 hirelingAura: false, disableChat: true,
                                 xpMultiplier: 3, xpActs: [3, 4], xpDifficulties: [1, 3] },
];

/**
 * A Class Builder share code, built the same way scripts/verify-class-build-download.mjs
 * does: the builder modules are TypeScript, so transpile them on the fly.
 */
let builderModules;
function classBuildCode({ cls, seed, pages, fill }) {
  if (!builderModules) {
    const root = path.resolve(import.meta.dirname, '..');
    const modules = new Map();
    const load = (name) => {
      const file = path.resolve(root, name);
      if (modules.has(file)) return modules.get(file).exports;
      const mod = { exports: {} };
      modules.set(file, mod);
      const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
      }).outputText;
      new Function('require', 'module', 'exports', code)(spec =>
        spec.startsWith('.') ? load(path.resolve(path.dirname(file), `${spec}.ts`))
          : spec.startsWith('@/') ? load(path.join(root, 'src', `${spec.slice(2)}.ts`))
            : require(spec), mod, mod.exports);
      return mod.exports;
    };
    const { loadSkills, loadTreeGrid } = load('src/lib/data-loader.ts');
    builderModules = {
      cb: load('src/lib/builder/class-build.ts'),
      encode: load('src/lib/builder/class-build-codec.ts').encodeClassBuild,
      skills: loadSkills(),
      treePages: loadTreeGrid(),
    };
  }
  const { cb, encode, skills, treePages } = builderModules;
  let spec = cb.emptyBuild(cls, seed);
  spec.pages = pages.map(i => ({ ...cb.PAGE_REFS[i] }));
  spec = cb.fillEmptySlots(spec, skills, treePages, fill);
  return encode(spec, skills, treePages);
}

function buildTuple(spec) {
  // A build's share code carries its own seed and forces race mode and weekly off, so
  // nothing else in the spec applies.
  if (spec.build) {
    const code = classBuildCode(spec.build);
    return { name: spec.name, body: { classBuild: code }, query: `build=${code}` };
  }
  const {
    seed, enablePrereqs = true, players = 1, acts = [1, 2, 3, 4, 5],
    staff = 0, staffSpeed = true, dropSource = 'Corpsefire', cube = false,
    hirelingAura = true, disableChat = false,
    xpMultiplier = 1, xpActs = [1, 2, 3, 4, 5], xpDifficulties = [1, 2, 3],
    weekly = 0, raceMode = false, enemyShuffle = false,
  } = spec;

  // Mirror the routes' own normalization. /api/randomize collapses acts to the
  // full set when players <= 1, and xpActs/xpDifficulties when xpMultiplier is 1;
  // /api/download does NOT, so we must pre-collapse before building the query or
  // the two cache keys disagree.
  const effActs = players > 1 ? acts : [1, 2, 3, 4, 5];
  const effXpActs = xpMultiplier > 1 ? xpActs : [1, 2, 3, 4, 5];
  const effXpDiffs = xpMultiplier > 1 ? xpDifficulties : [1, 2, 3];
  // Weekly forces raceMode off in BOTH routes; mirror it so the key matches.
  const effRace = weekly ? false : raceMode;

  const body = {
    seed,
    enablePrereqs,
    playersEnabled: players > 1,
    playersCount: players,
    playersActs: effActs,
    startingItems: {
      teleportStaff: staff > 0,
      teleportStaffLevel: staff,
      teleportStaffDropSource: dropSource,
      teleportStaffSpeed: staffSpeed,
      horadricCube: cube,
    },
    hirelingAura,
    disableChat,
    xpMultiplier,
    xpActs: effXpActs,
    xpDifficulties: effXpDiffs,
    raceMode: effRace,
    enemyShuffle,
    ...(weekly ? { weeklyChallenge: { enabled: true, weekOverride: weekly } } : {}),
  };

  const q = new URLSearchParams();
  q.set('seed', String(seed));
  q.set('players', String(players));
  q.set('acts', effActs.join(','));
  q.set('teleportStaff', String(staff));
  q.set('dropSource', dropSource);
  q.set('staffSpeed', staff > 0 && staffSpeed ? '1' : '0');
  q.set('cube', cube ? '1' : '0');
  q.set('hirelingAura', hirelingAura ? '1' : '0');
  q.set('disableChat', disableChat ? '1' : '0');
  q.set('noPrereqs', enablePrereqs ? '0' : '1');
  q.set('xpMultiplier', String(xpMultiplier));
  q.set('xpActs', effXpActs.join(','));
  q.set('xpDifficulties', effXpDiffs.join(','));
  q.set('raceMode', effRace ? '1' : '0');
  if (enemyShuffle) q.set('enemyShuffle', '1');
  if (weekly) { q.set('weekly', '1'); q.set('weekOverride', String(weekly)); }

  return { name: spec.name, body, query: q.toString() };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * /api/randomize rate-limits fresh generations to 3 per 60s per IP, so each tuple
 * presents its own client address. A busy queue still answers 503; honour Retry-After.
 */
let ip = 0;
async function postWithRetry(tuple) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const res = await fetch(`${BASE}/api/randomize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': `10.8.0.${++ip % 250}` },
      body: JSON.stringify(tuple.body),
    });
    if (res.ok) return;
    if (res.status === 429 || res.status === 503) {
      const retry = Number(res.headers.get('retry-after')) || 20;
      process.stdout.write(` [${res.status}, waiting ${retry}s]`);
      await sleep((retry + 1) * 1000);
      continue;
    }
    throw new Error(`randomize ${tuple.name}: ${res.status} ${await res.text()}`);
  }
  throw new Error(`randomize ${tuple.name}: still rate-limited after 12 attempts`);
}

async function hashTuple(tuple) {
  await postWithRetry(tuple);

  const dl = await fetch(`${BASE}/api/download?${tuple.query}`);
  if (!dl.ok) {
    const txt = await dl.text();
    // A 404 here means the two cache keys disagreed -- i.e. buildTuple's mapping
    // drifted from one of the routes. Say so, because "Zip not found" alone sends
    // you looking in the wrong place entirely.
    throw new Error(
      `download ${tuple.name}: ${dl.status} ${txt}\n` +
      `  -> cache-key mismatch between the POST body and the GET query.\n` +
      `  -> query was: ${tuple.query}`,
    );
  }

  const zip = new AdmZip(Buffer.from(await dl.arrayBuffer()));
  const entries = {};
  for (const e of zip.getEntries()) {
    if (e.isDirectory) continue;
    entries[e.entryName.replace(/\\/g, '/')] =
      crypto.createHash('sha256').update(e.getData()).digest('hex');
  }
  return Object.fromEntries(Object.entries(entries).sort(([a], [b]) => a.localeCompare(b)));
}

function diffEntries(expected, actual) {
  const problems = [];
  for (const [file, hash] of Object.entries(expected)) {
    if (!(file in actual)) problems.push(`    MISSING  ${file}`);
    else if (actual[file] !== hash) problems.push(`    CHANGED  ${file}`);
  }
  for (const file of Object.keys(actual)) {
    if (!(file in expected)) problems.push(`    ADDED    ${file}`);
  }
  return problems;
}

async function main() {
  const tuples = SPECS.map(buildTuple);
  const names = new Set(tuples.map(t => t.name));
  if (names.size !== tuples.length) throw new Error('duplicate tuple name in SPECS');

  const health = await fetch(`${BASE}/api/health`).catch(() => null);
  if (!health || !health.ok) {
    console.error(`Dev server not reachable at ${BASE}. Start it with: node scripts/dev-cold-cache.mjs`);
    process.exit(2);
  }

  // A warm zip cache makes verification VACUOUS. Stage 1 deliberately does not bump
  // PIPELINE_VERSION (byte-identical output is the whole point), so every cache key
  // is unchanged by the refactor -- /api/randomize would serve the pre-refactor zip
  // straight from cache and every tuple would "pass" without the new code ever
  // running. Refuse rather than report a false green.
  //
  // Threshold rather than zero: warmup.ts fire-and-forget pre-generates the current
  // week's challenge zip at boot, so a legitimately cold server still reports 1-2
  // entries. The hazard this catches is the real one -- pointing at a server backed
  // by the persistent STATE_DIR cache, which holds dozens of pre-refactor zips.
  //
  // Note this is a heuristic, not a proof: /api/health reports the MEMORY tier,
  // which the 500 MB cap evicts (47 MB zips => ~11 max), so neither a zero-check nor
  // counting newly added entries is reliable. The throwaway ZIP_CACHE_DIR workflow
  // below is the actual guarantee.
  const WARMUP_ALLOWANCE = 2;
  const stats = await health.json().catch(() => ({}));
  const cached = stats?.zipCache?.entries ?? 0;
  if (!CAPTURE && cached > WARMUP_ALLOWANCE && !ALLOW_WARM) {
    console.error(
      `Refusing to verify against a warm zip cache (${cached} entries).\n\n` +
      `  The refactor does not change any cache key, so cached zips would be served\n` +
      `  and all ${tuples.length} tuples would pass without exercising the new code.\n\n` +
      `  Restart the dev server with a throwaway cache, then re-run:\n\n` +
      `    node scripts/dev-cold-cache.mjs\n` +
      `    node scripts/verify-generate-mod-refactor.mjs\n\n` +
      `  (--allow-warm-cache overrides, but only do that for a smoke test.)`,
    );
    process.exit(2);
  }

  console.log(`${CAPTURE ? 'Capturing' : 'Verifying'} ${tuples.length} tuples against ${BASE}`);
  console.log(`zip cache: ${cached} entries` +
              (cached <= WARMUP_ALLOWANCE ? ' (cold enough -- generation is real)' : ' (WARM)') + '\n');

  const results = {};
  for (const [i, tuple] of tuples.entries()) {
    process.stdout.write(`  [${String(i + 1).padStart(2)}/${tuples.length}] ${tuple.name.padEnd(22)}`);
    results[tuple.name] = await hashTuple(tuple);
    console.log(` ok (${Object.keys(results[tuple.name]).length} entries)`);
  }

  if (CAPTURE) {
    fs.mkdirSync(path.dirname(FIXTURE), { recursive: true });
    fs.writeFileSync(FIXTURE, JSON.stringify({
      capturedAt: new Date().toISOString(),
      note: 'Byte-identity baseline for the randomization pipeline. Regenerate ONLY '
          + 'when output is intentionally changed, and bump PIPELINE_VERSION when you do.',
      tuples: results,
    }, null, 2) + '\n');
    console.log(`\nWrote ${path.relative(process.cwd(), FIXTURE)}`);
    return;
  }

  if (!fs.existsSync(FIXTURE)) {
    console.error(`\nNo fixture at ${FIXTURE}. Run with --capture first.`);
    process.exit(2);
  }
  const fixture = JSON.parse(fs.readFileSync(FIXTURE, 'utf-8'));

  let failed = 0;
  for (const tuple of tuples) {
    const expected = fixture.tuples[tuple.name];
    if (!expected) {
      console.log(`\n  NEW TUPLE (not in fixture): ${tuple.name}`);
      failed++;
      continue;
    }
    const problems = diffEntries(expected, results[tuple.name]);
    if (problems.length) {
      console.log(`\n  FAIL ${tuple.name}`);
      problems.forEach(p => console.log(p));
      failed++;
    }
  }
  for (const name of Object.keys(fixture.tuples)) {
    if (!names.has(name)) { console.log(`\n  REMOVED TUPLE: ${name}`); failed++; }
  }

  if (failed) {
    console.error(`\n${failed}/${tuples.length} tuples differ from the fixture.`);
    console.error('Mod output changed. If that was intentional, re-capture');
    console.error('AND bump PIPELINE_VERSION -- stale cached zips are served by seed.');
    process.exit(1);
  }
  console.log(`\nAll ${tuples.length} tuples byte-identical to the fixture.`);
}

main().catch(err => { console.error(`\n${err.message}`); process.exit(1); });
