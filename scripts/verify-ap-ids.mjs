/**
 * verify-ap-ids.mjs
 *
 * Diffs the Archipelago id tables produced by the Go client against those produced by
 * the Python apworld.
 *
 * WHY THIS IS THE MOST IMPORTANT AP TEST: the apworld generates a multiworld OFFLINE —
 * it never contacts the client, the server, or d2rrandomizer.com. The only thing keeping
 * the two sides in agreement is that both derive ids from the same fixed ordering. If
 * they ever diverge, generation still succeeds and the room still starts; the failure
 * shows up as a player receiving the WRONG SKILL, or a check registering as some other
 * location. Nothing else in the stack would catch that.
 *
 * Ids are also IMMUTABLE once a room exists, so a divergence cannot simply be fixed
 * forward — in-flight rooms would break.
 *
 * Requires Go and Python on PATH.
 *
 *   node scripts/verify-ap-ids.mjs
 */
import { execFileSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import ts from 'typescript';

const repoRoot = path.resolve(import.meta.dirname, '..');
const goDir = path.join(repoRoot, 'tools', 'ap-client');
const pyFile = path.join(repoRoot, 'apworld', 'dev', 'iddump.py');

function run(cmd, args, opts = {}) {
  try {
    return execFileSync(cmd, args, { encoding: 'utf-8', maxBuffer: 64 << 20, ...opts });
  } catch (err) {
    const detail = [err.stdout, err.stderr].filter(Boolean).join('\n').trim();
    throw new Error(`${cmd} ${args.join(' ')} failed:\n${detail || err.message}`);
  }
}

function pythonCmd() {
  for (const c of ['python', 'py', 'python3']) {
    try {
      execFileSync(c, ['--version'], { stdio: 'ignore' });
      return c;
    } catch { /* try the next one */ }
  }
  throw new Error('no python interpreter found on PATH');
}

function loadTs(file) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  new Function('module', 'exports', code)(mod, mod.exports);
  return mod.exports;
}

function diffTables(label, a, b, problems) {
  const aKeys = Object.keys(a), bKeys = Object.keys(b);
  for (const k of aKeys) {
    if (!(k in b)) problems.push(`${label}: "${k}" exists in Go but not in Python`);
    else if (a[k] !== b[k]) problems.push(`${label}: "${k}" is ${a[k]} in Go but ${b[k]} in Python`);
  }
  for (const k of bKeys) {
    if (!(k in a)) problems.push(`${label}: "${k}" exists in Python but not in Go`);
  }
  if (aKeys.length !== bKeys.length) {
    problems.push(`${label}: Go has ${aKeys.length} entries, Python has ${bKeys.length}`);
  }
}

function main() {
  if (!fs.existsSync(pyFile)) {
    console.error(`apworld id dumper not found at ${pyFile}`);
    process.exit(2);
  }

  const go = JSON.parse(run('go', ['run', './cmd/iddump'], { cwd: goDir }));
  const py = JSON.parse(run(pythonCmd(), [pyFile]));

  const problems = [];

  // Everything that is not one of the two big tables is compared whole. A mismatch here
  // (a base, a class order, an area table, a rule constant) explains every downstream id
  // difference at once, instead of hundreds of individual diffs.
  const keys = new Set([...Object.keys(go), ...Object.keys(py)]);
  for (const key of [...keys].sort()) {
    if (['items', 'locations', 'locationNames', 'activeCounts'].includes(key)) continue;
    const a = JSON.stringify(go[key]), b = JSON.stringify(py[key]);
    if (a !== b) problems.push(`${key}: Go ${String(a).slice(0, 90)} != Python ${String(b).slice(0, 90)}`);
  }

  diffTables('item', go.items, py.items, problems);
  diffTables('location', go.locations, py.locations, problems);
  diffTables('location name', go.locationNames, py.locationNames, problems);

  // The page's list of checks (checks.ts over ap-names.json) must count what the apworld
  // generates, for every goal and every check toggle.
  const checks = loadTs(path.join(repoRoot, 'src', 'lib', 'archipelago', 'checks.ts'));
  const names = JSON.parse(fs.readFileSync(path.join(repoRoot, 'src', 'lib', 'archipelago', 'ap-names.json'), 'utf8'));
  for (const [key, want] of Object.entries(py.activeCounts ?? {})) {
    const [gd, ga, w, a, lv] = key.split(':').map(Number);
    const got = checks.activeLocations(names, {
      goalDifficulty: gd, goalAct: ga, waypoints: w === 1, areas: a === 1, levels: lv === 1,
    }).length;
    if (got !== want) problems.push(`page check count for ${key} (difficulty:act:waypoints:areas:levels) is ${got}, the apworld's ${want}`);
  }
  if (!py.activeCounts) problems.push('the Python dump has no activeCounts');

  const itemCount = Object.keys(go.items).length;
  const locCount = Object.keys(go.locations).length;

  if (problems.length) {
    console.error(`\nid tables DIVERGE (${problems.length} problem(s)):\n`);
    problems.slice(0, 25).forEach(p => console.error(`  - ${p}`));
    if (problems.length > 25) console.error(`  ... and ${problems.length - 25} more`);
    console.error('\nThe apworld and the client must agree exactly, or players receive the');
    console.error('wrong items. Ids are immutable once a room exists — fix the side that');
    console.error('changed, do not renumber.');
    process.exit(1);
  }

  console.log(`Go and Python id tables agree exactly.`);
  console.log(`  ${itemCount} items (${go.traps.length} traps, ${go.runes.length} runes)`);
  console.log(
    `  ${locCount} locations (${go.questsTotal} quests, ${go.locationsTotal - go.questsTotal - go.areas * 3 - (go.levelMax - go.levelMin + 1)} waypoints, ` +
      `${go.areas * 3} areas, ${go.levelMax - go.levelMin + 1} level milestones)`,
  );
}

main();
