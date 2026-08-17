/**
 * verify-skill-icons.mjs
 *
 * Read-only check that the web spoiler's icon assets line up with the game data
 * they're addressed by. The spoiler grid builds a URL directly from
 * (iconClass, IconCel) with no fallback, so a gap here renders as a blank cell.
 *
 * Invariants:
 *   1. CLASS_DEFS parses to 8 code -> iconFolder pairs, and those folders are
 *      exactly the folders present under data/sprites/icons.
 *   2. Every class has all 30 even cels (0..58) as both a source .bmp and a
 *      generated public/skill-icons/<v>/<code>_<cel>.webp.
 *   3. public/skill-icons/<v> holds exactly 240 files — catches orphans left
 *      behind by a renamed or removed class.
 *   4. Every IconCel in skilldesc.json is even and within 0..58. The whole
 *      <code>_<cel> naming scheme rests on this.
 *
 * Usage:
 *   node scripts/verify-skill-icons.mjs
 *
 * Exits 1 on any violation.
 */
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const CONFIG_TS = path.join(ROOT, 'src', 'lib', 'randomizer', 'config.ts');
const SKILL_ICONS_TS = path.join(ROOT, 'src', 'lib', 'ui', 'skill-icons.ts');
const ICONS_DIR = path.join(ROOT, 'data', 'sprites', 'icons');
const SKILLDESC = path.join(ROOT, 'data', 'json', 'skilldesc.json');

const CELS = Array.from({ length: 30 }, (_, i) => i * 2);

const failures = [];
const fail = msg => failures.push(msg);

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf-8').replace(/^﻿/, ''));
}

// The version lives in the client helper; read it rather than hardcoding, so a
// bump there is automatically what this script checks.
const versionMatch = fs.readFileSync(SKILL_ICONS_TS, 'utf-8')
  .match(/SKILL_ICON_VERSION\s*=\s*'([^']+)'/);
if (!versionMatch) {
  console.error(`FAIL: could not parse SKILL_ICON_VERSION from ${SKILL_ICONS_TS}`);
  process.exit(1);
}
const OUT_DIR = path.join(ROOT, 'public', 'skill-icons', versionMatch[1]);

// ── 1. class map matches the folders on disk ────────────────────────────────
const src = fs.readFileSync(CONFIG_TS, 'utf-8');
const pairs = [...src.matchAll(/code:\s*'(\w+)'[^}]*iconFolder:\s*'(\w+)'/g)]
  .map(m => ({ code: m[1], folder: m[2] }));

if (pairs.length !== 8) {
  fail(`CLASS_DEFS parsed ${pairs.length} code/iconFolder pairs, expected 8`);
}

const onDisk = fs.existsSync(ICONS_DIR)
  ? fs.readdirSync(ICONS_DIR, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name).sort()
  : [];
const declared = pairs.map(p => p.folder).sort();
if (onDisk.join(',') !== declared.join(',')) {
  fail(`icon folders on disk [${onDisk.join(', ')}] != CLASS_DEFS iconFolders [${declared.join(', ')}]`);
}

// ── 2. every even cel exists as source and as output ───────────────────────
for (const { code, folder } of pairs) {
  for (const cel of CELS) {
    const source = path.join(ICONS_DIR, folder, `${folder}_${cel}.bmp`);
    if (!fs.existsSync(source)) fail(`missing source icon ${path.relative(ROOT, source)}`);
    const out = path.join(OUT_DIR, `${code}_${cel}.webp`);
    if (!fs.existsSync(out)) {
      fail(`missing generated tile ${path.relative(ROOT, out)} — run scripts/build-skill-icon-assets.mjs`);
    }
  }
}

// ── 3. no orphaned tiles ───────────────────────────────────────────────────
const expectedCount = pairs.length * CELS.length;
if (!fs.existsSync(OUT_DIR)) {
  fail(`${path.relative(ROOT, OUT_DIR)} does not exist — run scripts/build-skill-icon-assets.mjs`);
} else {
  const files = fs.readdirSync(OUT_DIR);
  if (files.length !== expectedCount) {
    const expected = new Set(pairs.flatMap(p => CELS.map(c => `${p.code}_${c}.webp`)));
    const orphans = files.filter(f => !expected.has(f));
    fail(
      `${path.relative(ROOT, OUT_DIR)} holds ${files.length} files, expected ${expectedCount}` +
      (orphans.length ? ` (orphans: ${orphans.slice(0, 8).join(', ')})` : ''),
    );
  }
}

// ── 4. every IconCel is an even index inside the sheet ─────────────────────
const descs = readJson(SKILLDESC);
let celCount = 0;
for (const [key, value] of Object.entries(descs)) {
  if (!value.skilldesc) continue;
  const cel = value.IconCel;
  if (typeof cel !== 'number') continue; // absent IconCel defaults to 0 downstream
  celCount++;
  if (cel % 2 !== 0 || cel < 0 || cel > 58) {
    fail(`skilldesc row ${key} (${value.skilldesc}) has IconCel ${cel} — must be even and within 0..58`);
  }
}

// ── report ─────────────────────────────────────────────────────────────────
if (failures.length > 0) {
  console.error(`FAIL: ${failures.length} problem(s)\n  ${failures.slice(0, 20).join('\n  ')}`);
  if (failures.length > 20) console.error(`  ...and ${failures.length - 20} more`);
  process.exit(1);
}

console.log(
  `OK: ${pairs.length} classes x ${CELS.length} cels = ${expectedCount} tiles present in ` +
  `public/skill-icons/${versionMatch[1]}; ${celCount} skilldesc IconCel values valid`,
);
