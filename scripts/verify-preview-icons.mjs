/**
 * verify-preview-icons.mjs
 *
 * Read-only check that /api/preview's spoiler payload is self-consistent: the
 * name, description and icon it reports for every skill must all come from the
 * SAME skilldesc entry.
 *
 * Why this is the interesting invariant: substitute placements resolve their
 * display data through the source skill's skilldesc, and substitution can chain.
 * A single-hop resolution reads the INTERMEDIATE skill's entry, so the name and
 * IconCel come from the intermediate skill while iconClass comes transitively
 * from the final source — the triple cannot stay consistent. This script builds
 * an independent (charclass, IconCel) -> name/description index from the local
 * data files and asserts the API agrees, so a regression to one hop fails here.
 * (That was the v0.258 bug, fixed for the mod output but not the spoiler until
 * v0.260.)
 *
 * Also checks: every cel is even and has a generated tile on disk, and every tab
 * holds at most 18 skills at unique row/col positions.
 *
 * Requires a running server (npm run dev).
 *
 * Usage:
 *   node scripts/verify-preview-icons.mjs
 *   TARGET=https://d2rrandomizer.com node scripts/verify-preview-icons.mjs
 *
 * Exits 1 on any violation.
 */
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const BASE = process.env.TARGET || 'http://localhost:3000';
const SEEDS = [1, 7, 42, 99, 256, 777, 1234, 4096, 12345, 31337, 60606, 99999,
  123456, 424242, 888888, 1000003, 2718281, 3141592, 7654321, 98765432];

const SKILLS = path.join(ROOT, 'data', 'json', 'skills.json');
const SKILLDESC = path.join(ROOT, 'data', 'json', 'skilldesc.json');
const STRINGS = path.join(ROOT, 'data', 'local', 'strings', 'skills.json');
const SKILL_ICONS_TS = path.join(ROOT, 'src', 'lib', 'ui', 'skill-icons.ts');

const readJson = file => JSON.parse(fs.readFileSync(file, 'utf-8').replace(/^﻿/, ''));

const failures = [];
const fail = msg => { if (failures.length < 200) failures.push(msg); };

const iconVersion = fs.readFileSync(SKILL_ICONS_TS, 'utf-8').match(/SKILL_ICON_VERSION\s*=\s*'([^']+)'/)?.[1];
if (!iconVersion) {
  console.error(`FAIL: could not parse SKILL_ICON_VERSION from ${SKILL_ICONS_TS}`);
  process.exit(1);
}
const TILE_DIR = path.join(ROOT, 'public', 'skill-icons', iconVersion);

// ── Independent index: (charclass, IconCel) -> { name, desc } ───────────────
// Built from the raw data files, deliberately without importing any app code,
// so it can disagree with the route's resolution.
const stringsByKey = new Map(readJson(STRINGS).map(s => [s.Key, s.enUS]));
const localized = key => {
  const v = stringsByKey.get(key);
  return v && v.trim() ? v : '';
};

const descByName = new Map();
for (const value of Object.values(readJson(SKILLDESC))) {
  if (value.skilldesc) descByName.set(value.skilldesc, value);
}

// charclass ownership comes from skills.json; a (class, cel) pair must be unique
// within a class, which is what makes the reverse lookup sound.
const expected = new Map(); // `${charclass}:${cel}` -> { name, desc, skilldesc }
for (const value of Object.values(readJson(SKILLS))) {
  if (!value.charclass || !value.skilldesc) continue;
  const desc = descByName.get(value.skilldesc);
  if (!desc) continue;
  const key = `${value.charclass}:${desc.IconCel ?? 0}`;
  const entry = {
    skilldesc: value.skilldesc,
    name: localized(desc['str name']) || value.skill,
    desc: localized(desc['str long']) || localized(desc['str short']),
  };
  const prior = expected.get(key);
  if (prior && prior.skilldesc !== entry.skilldesc) {
    fail(`(${key}) maps to two skilldescs: ${prior.skilldesc} and ${entry.skilldesc} — reverse lookup is ambiguous`);
  }
  expected.set(key, entry);
}

// ── Check each seed ─────────────────────────────────────────────────────────
async function preview(body) {
  const res = await fetch(`${BASE}/api/preview`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${BASE}/api/preview -> ${res.status} ${await res.text()}`);
  return res.json();
}

const tileExists = new Map();
function hasTile(classCode, cel) {
  const key = `${classCode}_${cel}`;
  if (!tileExists.has(key)) {
    tileExists.set(key, fs.existsSync(path.join(TILE_DIR, `${key}.webp`)));
  }
  return tileExists.get(key);
}

async function checkSeed(seed) {
  const data = await preview({ seed });
  if (data.masked !== false) fail(`seed ${seed}: masked should be false, got ${data.masked}`);

  let n = 0;
  for (const cls of data.classes) {
    for (const [tabIdx, tab] of cls.tabs.entries()) {
      if (tab.skills.length > 18) {
        fail(`seed ${seed} ${cls.code} tab ${tabIdx}: ${tab.skills.length} skills, max 18`);
      }
      const seenCells = new Set();
      for (const s of tab.skills) {
        n++;
        const cell = `${s.row}-${s.col}`;
        if (seenCells.has(cell)) fail(`seed ${seed} ${cls.code} tab ${tabIdx}: duplicate cell ${cell}`);
        seenCells.add(cell);

        if (s.iconCel % 2 !== 0) fail(`seed ${seed} ${s.name}: odd iconCel ${s.iconCel}`);
        if (!hasTile(s.iconClass, s.iconCel)) {
          fail(`seed ${seed} ${s.name}: no tile for ${s.iconClass}_${s.iconCel}`);
        }
        if (s.iconClass !== s.originalClass) {
          fail(`seed ${seed} ${s.name}: iconClass ${s.iconClass} != originalClass ${s.originalClass}`);
        }

        // The load-bearing assertion: name AND description must both match what
        // the (iconClass, iconCel) pair independently resolves to.
        const want = expected.get(`${s.iconClass}:${s.iconCel}`);
        if (!want) {
          fail(`seed ${seed} ${s.name}: (${s.iconClass}, ${s.iconCel}) is not a known class-skill icon`);
          continue;
        }
        if (want.name !== s.name) {
          fail(`seed ${seed}: icon ${s.iconClass}_${s.iconCel} is "${want.name}" but the spoiler labels it "${s.name}"`);
        }
        if (want.desc !== s.desc) {
          fail(`seed ${seed} ${s.name}: description does not match ${want.skilldesc}'s`);
        }
      }
    }
  }
  return n;
}

async function checkMasked() {
  const data = await preview({ seed: 12345, maskSkills: true });
  if (data.masked !== true) fail(`maskSkills: masked should be true, got ${data.masked}`);
  for (const cls of data.classes) {
    for (const tab of cls.tabs) {
      for (const s of tab.skills) {
        if (s.name !== '???' || s.desc !== '' || s.originalClass !== '?') {
          fail(`maskSkills: leaked skill data ${JSON.stringify(s)}`);
        }
        // Must match MYSTERY_ICON, which is what the mod overrides every frame with.
        if (s.iconClass !== 'sor' || s.iconCel !== 0) {
          fail(`maskSkills: icon ${s.iconClass}_${s.iconCel}, expected sor_0 (MYSTERY_ICON)`);
        }
      }
    }
  }
}

async function main() {
  let total = 0;
  for (const seed of SEEDS) total += await checkSeed(seed);
  await checkMasked();

  if (failures.length > 0) {
    console.error(`FAIL: ${failures.length} problem(s)\n  ${failures.slice(0, 25).join('\n  ')}`);
    if (failures.length > 25) console.error(`  ...and ${failures.length - 25} more`);
    process.exit(1);
  }
  console.log(`OK: ${SEEDS.length} seeds x ${total / SEEDS.length} skills checked against ${BASE} (name, description and icon agree), plus the masked path`);
}

main().catch(err => { console.error(err.message || err); process.exit(1); });
