#!/usr/bin/env node
/**
 * Generate the frozen area tables shared by the apworld and the Go client.
 *
 * Emits apworld/d2rr/areas.py and tools/ap-client/internal/ids/areas.go from
 * data/txt/levels.txt. Both are CHECKED IN; this script exists so the two can never be
 * transcribed differently by hand, not so they can be rebuilt at will.
 *
 * RUN ONCE, THEN TREAT THE OUTPUT AS FROZEN. Location ids are derived from position in
 * these tables and are immutable the moment a multiworld exists — regenerating after
 * levels.txt changes would silently re-key every in-flight room. scripts/verify-ap-ids.mjs
 * re-derives the tables and fails if the checked-in ones no longer match, so a levels.txt
 * change surfaces as a loud test failure that a human resolves by APPENDING, never as a
 * quiet renumber.
 *
 *   node scripts/gen-ap-areas.mjs           # write the tables
 *   node scripts/gen-ap-areas.mjs --check   # exit 1 if they would change
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Areas that are not part of getting to an act boss, and so must never hold a check:
 * an item placed there would be stranded.
 *
 *   39        Moo Moo Farm: the portal needs Baal dead on that difficulty, which is
 *             after the goal.
 *   133-136   the Pandemonium event: Hell only, and behind keys farmed from three bosses.
 *   137       Colossal Summit: endgame.
 */
const EXCLUDED_LEVEL_IDS = new Set([39, 133, 134, 135, 136, 137]);

/**
 * levels.txt carries internal names. Where the game shows the player something else,
 * the location is named for what they will see, keyed by levels.txt Id.
 */
const DISPLAY_NAMES = new Map([
  [38, 'Tristram'],
  [47, 'Lut Gholein Sewers Level 1'], [48, 'Lut Gholein Sewers Level 2'], [49, 'Lut Gholein Sewers Level 3'],
  [66, "Tal Rasha's Tomb 1"], [67, "Tal Rasha's Tomb 2"], [68, "Tal Rasha's Tomb 3"], [69, "Tal Rasha's Tomb 4"],
  [70, "Tal Rasha's Tomb 5"], [71, "Tal Rasha's Tomb 6"], [72, "Tal Rasha's Tomb 7"],
  [75, 'Kurast Docks'], [84, 'Arachnid Lair'],
  [92, 'Kurast Sewers Level 1'], [93, 'Kurast Sewers Level 2'],
  [108, 'Chaos Sanctuary'],
  [111, 'Frigid Highlands'], [113, 'Crystalline Passage'], [114, 'Frozen River'], [115, 'Glacial Trail'],
  [116, 'Drifter Cavern'], [117, 'Frozen Tundra'], [118, "The Ancients' Way"], [119, 'Icy Cellar'],
  [120, 'Arreat Summit'], [121, "Nihlathak's Temple"], [123, 'Halls of Pain'],
  [125, 'Abaddon'], [126, 'Pit of Acheron'], [127, 'Infernal Pit'],
]);

/** Areas in levels.txt order: every row with a real LevelName that a run can reach. */
export function readAreas() {
  const text = readFileSync(join(root, 'data/txt/levels.txt'), 'utf8');
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  const headers = lines[0].split('\t');
  const col = (name) => {
    const i = headers.indexOf(name);
    if (i < 0) throw new Error(`levels.txt has no ${name} column`);
    return i;
  };
  const [idI, actI, nameI] = [col('Id'), col('Act'), col('LevelName')];

  const rows = [];
  for (const line of lines.slice(1)) {
    const f = line.split('\t');
    const name = (f[nameI] ?? '').trim();
    // "Expansion" is the terminator row, not a place you can stand in.
    if (!name || name === 'Expansion') continue;
    const id = Number(f[idI]);
    if (EXCLUDED_LEVEL_IDS.has(id)) continue;
    rows.push({ id, act: Number(f[actI]), name, label: DISPLAY_NAMES.get(id) ?? name });
  }

  // Location names must be unique, and levels.txt repeats some (seven Tal Rasha's Tombs,
  // two sets of Sewers). Every repeat has a display name above; fail if one ever does not.
  const labels = new Set(rows.map((r) => r.label));
  if (labels.size !== rows.length) {
    const seen = new Set();
    const repeated = rows.filter((r) => seen.has(r.label) || !seen.add(r.label)).map((r) => `${r.label} (${r.id})`);
    throw new Error(`area labels are not unique: ${repeated.join(', ')}`);
  }
  for (const id of [...EXCLUDED_LEVEL_IDS, ...DISPLAY_NAMES.keys()]) {
    if (!lines.slice(1).some((line) => Number(line.split('\t')[idI]) === id)) {
      throw new Error(`levels.txt has no Id ${id}, which this script names or excludes`);
    }
  }
  return rows;
}

/**
 * Waypoint index (0-38, the game's own waypoint order) -> levels.txt Id.
 *
 * The client reads the live waypoint panel out of memory, which identifies waypoints by
 * AREA id, and has to turn that into the waypoint index the location table is keyed on.
 * levels.txt's Waypoint column is authoritative for that ordering.
 */
export function readWaypoints() {
  const text = readFileSync(join(root, 'data/txt/levels.txt'), 'utf8');
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  const headers = lines[0].split('\t');
  const [wpI, idI] = [headers.indexOf('Waypoint'), headers.indexOf('Id')];
  if (wpI < 0) throw new Error('levels.txt has no Waypoint column');

  const byIndex = [];
  for (const line of lines.slice(1)) {
    const f = line.split('\t');
    const wp = (f[wpI] ?? '').trim();
    if (wp === '' || wp === '255') continue;
    byIndex[Number(wp)] = Number(f[idI]);
  }
  for (let i = 0; i < 39; i++) {
    if (byIndex[i] === undefined) throw new Error(`levels.txt has no area for waypoint ${i}`);
  }
  if (byIndex.length !== 39) throw new Error(`expected 39 waypoints, got ${byIndex.length}`);
  return byIndex;
}

const py = (rows, waypoints) => `"""Area tables for D2R Randomizer location ids.

GENERATED by scripts/gen-ap-areas.mjs from data/txt/levels.txt. Do not edit by hand.

FROZEN. An area's position in these lists determines its location id, and location ids
are immutable once a multiworld exists. If levels.txt gains or reorders a level, the
verifier fails; resolve it by APPENDING to these tables, never by renumbering them.

AREA_LEVEL_IDS holds the levels.txt Id the game reports for the player's current area,
which is what the client matches on. Position in the list is what the id is derived from
- the two are deliberately separate so a levels.txt renumber cannot move a location.
"""

AREA_LEVEL_IDS: list[int] = [
${chunk(rows.map((r) => String(r.id)), 12)}
]

AREA_LABELS: list[str] = [
${chunk(rows.map((r) => JSON.stringify(r.label)), 3)}
]

# 0-based act, used to gate an area behind the act it sits in.
AREA_ACTS: list[int] = [
${chunk(rows.map((r) => String(r.act)), 24)}
]

# Waypoint index (0-38, the game's waypoint order) -> levels.txt Id.
#
# The client reads the live waypoint panel out of memory, which names waypoints by AREA,
# and has to get back to the index the location ids are keyed on.
WAYPOINT_LEVEL_IDS: list[int] = [
${chunk(waypoints.map((id) => String(id)), 12)}
]
`;

const go = (rows, waypoints) => `package ids

// Area tables for D2R Randomizer location ids.
//
// GENERATED by scripts/gen-ap-areas.mjs from data/txt/levels.txt. Do not edit by hand.
// Mirror of apworld/d2rr/areas.py; scripts/verify-ap-ids.mjs requires exact agreement.
//
// FROZEN. Position in these slices determines a location id, and location ids are
// immutable once a multiworld exists.

// AreaLevelIDs are levels.txt Ids, which is what D2R reports as the player's area.
var AreaLevelIDs = []int{
${chunk(rows.map((r) => String(r.id)), 12)}
}

// AreaLabels are the display names, disambiguated where levels.txt repeats one.
var AreaLabels = []string{
${chunk(rows.map((r) => JSON.stringify(r.label)), 3)}
}

// AreaActs is the 0-based act each area sits in.
var AreaActs = []int{
${chunk(rows.map((r) => String(r.act)), 24)}
}

// WaypointLevelIDs maps a waypoint index (0-38, the game's waypoint order) to the
// levels.txt Id of the area it sits in.
//
// The live waypoint panel in memory identifies waypoints by AREA, while location ids are
// keyed on the index, so this translation has to exist somewhere.
var WaypointLevelIDs = []int{
${chunk(waypoints.map((id) => String(id)), 12)}
}
`;

/** Wrap values onto lines short enough for Archipelago's 120-column style. */
function chunk(values, perLine) {
  const out = [];
  for (let i = 0; i < values.length; i += perLine) {
    out.push('\t' + values.slice(i, i + perLine).join(', ') + ',');
  }
  return out.join('\n');
}

const rows = readAreas();
const waypoints = readWaypoints();
const targets = [
  [join(root, 'apworld/d2rr/areas.py'), py(rows, waypoints).replace(/\t/g, '    ')],
  [join(root, 'tools/ap-client/internal/ids/areas.go'), go(rows, waypoints)],
];

const check = process.argv.includes('--check');
let changed = 0;
for (const [path, content] of targets) {
  let existing = null;
  try {
    // A Windows checkout may have rewritten line endings; that is not a change.
    existing = readFileSync(path, 'utf8').split('\r\n').join('\n');
  } catch {
    /* not generated yet */
  }
  if (existing === content) continue;
  changed++;
  if (check) {
    console.error(`STALE: ${path} does not match data/txt/levels.txt`);
  } else {
    writeFileSync(path, content);
    console.log(`wrote ${path}`);
  }
}

if (check && changed) {
  console.error(
    '\nThe frozen area tables no longer match levels.txt. Location ids are IMMUTABLE\n' +
      'once a room exists, so do NOT just regenerate: work out what changed and append.',
  );
  process.exit(1);
}
console.log(`${rows.length} areas${check ? ' — tables match levels.txt' : ''}`);
