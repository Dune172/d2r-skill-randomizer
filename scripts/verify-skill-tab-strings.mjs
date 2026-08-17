/**
 * verify-skill-tab-strings.mjs
 *
 * Read-only check that the two families of "Random N" skill-tree labels agree,
 * so a "+N to Random X" item always names the tab it actually boosts.
 *
 * Two independent string families describe the same three trees:
 *
 *   Item side   charstats.txt StrSkillTab1/2/3 (column P = SkillPage P)
 *               -> StrSklTabItem* in data/local/strings/item-modifiers.json
 *   Label side  SkillCategoryXxN in SKILL_CATEGORY_OVERRIDES (src/app/api/randomize/route.ts)
 *
 * SkillCategoryXxN is the Nth tab left-to-right and the engine sits it over
 * SkillPage 4-N (vanilla proof: SkillCategoryAm1 = "Javelin and Spear" while
 * `jab` is SkillPage 3). So the invariant is:
 *
 *   SkillCategoryXxN     == "Random N"
 *   item string for page P == "Random (4-P)"
 *
 * The two families used to be inverted: an amulet reading "+1 to Random 3"
 * buffed the tab labelled "Random 1". Page 2 coincided either way, which is why
 * the bug looked intermittent.
 *
 * Usage:
 *   node scripts/verify-skill-tab-strings.mjs
 *
 * Exits 1 on any violation.
 */
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const CHARSTATS = path.join(ROOT, 'data', 'txt', 'charstats.txt');
const ITEM_MODIFIERS = path.join(ROOT, 'data', 'local', 'strings', 'item-modifiers.json');
const ROUTE = path.join(ROOT, 'src', 'app', 'api', 'randomize', 'route.ts');

// charstats.txt class name -> SkillCategory key prefix.
const CATEGORY_PREFIX = {
  Amazon: 'Am',
  Sorceress: 'So',
  Necromancer: 'Ne',
  Paladin: 'Pa',
  Barbarian: 'Ba',
  Druid: 'Dr',
  Assassin: 'As',
  Warlock: 'Wa',
};

const VALID_PREFIXES = ['%+d to ', '+%d to '];

const failures = [];
const fail = (msg) => failures.push(msg);

// --- charstats.txt: class -> [StrSklTabItem key for page 1, 2, 3] ---
const charstatsLines = fs.readFileSync(CHARSTATS, 'utf8').replace(/^﻿/, '').split(/\r?\n/);
const csHeaders = charstatsLines[0].split('\t');
const csClassIdx = csHeaders.indexOf('class');
const csTabIdx = [1, 2, 3].map((n) => csHeaders.indexOf(`StrSkillTab${n}`));
if (csClassIdx === -1 || csTabIdx.some((i) => i === -1)) {
  console.error('ABORT: charstats.txt is missing class / StrSkillTab1-3 columns');
  process.exit(1);
}

const tabKeysByClass = new Map();
for (const line of charstatsLines.slice(1)) {
  if (!line.trim()) continue;
  const row = line.split('\t');
  const className = row[csClassIdx];
  if (!CATEGORY_PREFIX[className]) continue; // skips the "Expansion" separator row
  tabKeysByClass.set(className, csTabIdx.map((i) => row[i]));
}

const missingClasses = Object.keys(CATEGORY_PREFIX).filter((c) => !tabKeysByClass.has(c));
if (missingClasses.length) {
  console.error(`ABORT: charstats.txt has no row for ${missingClasses.join(', ')}`);
  process.exit(1);
}

// --- item-modifiers.json: key -> enUS ---
const itemModifiers = JSON.parse(fs.readFileSync(ITEM_MODIFIERS, 'utf8').replace(/^﻿/, ''));
const itemStrings = new Map(itemModifiers.map((e) => [e.Key, e.enUS]));

// --- route.ts: SkillCategoryXxN -> enUS ---
const routeSrc = fs.readFileSync(ROUTE, 'utf8');
const labels = new Map();
for (const m of routeSrc.matchAll(/Key: '(SkillCategory\w\w\d)', enUS: '([^']*)'/g)) {
  labels.set(m[1], m[2]);
}
if (labels.size !== 24) {
  console.error(`ABORT: expected 24 SkillCategory overrides in route.ts, found ${labels.size}`);
  process.exit(1);
}

// --- Check both families, per class ---
for (const [className, prefix] of Object.entries(CATEGORY_PREFIX)) {
  const keys = tabKeysByClass.get(className);
  const seen = new Set();

  for (const page of [1, 2, 3]) {
    const key = keys[page - 1];
    const expected = `Random ${4 - page}`;

    // Item side: the string an item's skilltab bonus renders for this page.
    const value = itemStrings.get(key);
    if (value === undefined) {
      fail(`${className} page ${page}: ${key} missing from item-modifiers.json`);
      continue;
    }
    if (!VALID_PREFIXES.some((p) => value.startsWith(p))) {
      // A missing format specifier makes D2R fall back to Tristram dialogue (see e7dad2a).
      fail(`${className} page ${page}: ${key} = ${JSON.stringify(value)} has no %+d / +%d specifier`);
    }
    const label = value.replace(/^(\%\+d|\+\%d) to /, '');
    if (label !== expected) {
      fail(`${className} page ${page}: ${key} says ${JSON.stringify(label)}, expected ${JSON.stringify(expected)}`);
    }
    seen.add(label);

    // Label side: SkillCategoryXxN is tab slot N and must read "Random N".
    const catKey = `SkillCategory${prefix}${page}`;
    const catValue = labels.get(catKey);
    if (catValue !== `Random ${page}`) {
      fail(`${catKey} = ${JSON.stringify(catValue)}, expected ${JSON.stringify(`Random ${page}`)}`);
    }
  }

  if (seen.size !== 3) {
    fail(`${className}: its three tabs do not map to three distinct labels (got ${[...seen].join(', ')})`);
  }
}

if (failures.length) {
  console.error(`FAIL — ${failures.length} violation(s):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log('OK — all 8 classes: item strings and tab labels agree.');
console.log('  tab slot N reads "Random N"; the item bonus for SkillPage P reads "Random 4-P".');
