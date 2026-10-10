/**
 * verify-apworld-fill.mjs — generate real Archipelago multiworlds across the option
 * space, and audit each one's logic from its spoiler.
 *
 * The apworld's failure modes are almost all generation-time and almost all opaque:
 * more items than locations, a location no rule can reach, a goal that cannot be
 * satisfied. None of them show up until Archipelago's fill runs, and the error points at
 * fill rather than at the option that caused it. So the only real test is to generate,
 * repeatedly, across combinations.
 *
 * Generating is not enough on its own: a world whose every location is reachable from
 * the start also generates. So each run's spoiler is read back and checked:
 *   - the goal boss's event is in the playthrough (the slot is beatable, and by that boss)
 *   - nothing past the goal was placed
 *   - Horadric Keys, when on, are in the pool in the number the goal needs, and the
 *     playthrough collects them before the goal
 *   - the pool holds the kinds of item the options asked for
 *
 * Requires Archipelago installed (default C:\ProgramData\Archipelago) and the apworld
 * built and installed:
 *
 *   node scripts/build-apworld.mjs --install
 *   node scripts/verify-apworld-fill.mjs [--case <name>] [--verbose]
 */
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import AdmZip from 'adm-zip';

const AP_DIR = process.env.ARCHIPELAGO_DIR || 'C:\\ProgramData\\Archipelago';
const GENERATOR = path.join(AP_DIR, 'ArchipelagoGenerate.exe');
const VERBOSE = process.argv.includes('--verbose');

const CLASSES = ['amazon', 'sorceress', 'necromancer', 'paladin', 'barbarian', 'druid', 'assassin', 'warlock'];
const DIFFICULTIES = ['normal', 'nightmare', 'hell'];
const BOSSES = ['andariel', 'duriel', 'mephisto', 'diablo', 'baal'];
const LOGIC = ['relaxed', 'standard', 'strict'];
const title = s => s[0].toUpperCase() + s.slice(1);

const DEFAULTS = {
  character_class: 'paladin', goal_difficulty: 'normal', goal_boss: 'baal',
  skill_points: 110, starting_skill_points: 1, logic_difficulty: 'standard',
  include_waypoints: true, include_areas: true, include_level_milestones: true,
  key_items: false, stat_points: 'vanilla', rune_percentage: 0, trap_percentage: 0,
  xp_multiplier: 1, monster_shuffle: false, death_link: false,
};
const QUESTS_ONLY = { include_waypoints: false, include_areas: false, include_level_milestones: false };
const EVERYTHING = { key_items: true, stat_points: 'pooled', rune_percentage: 40, trap_percentage: 15 };

/**
 * Cases cover the combinations that actually differ rather than the full cross product:
 * every class, every goal, every logic setting, the check groups on and off, the
 * skill-point extremes where the pool has to be trimmed, and every experimental item
 * type alone and together, including on the smallest slots where they compete for room.
 */
function cases() {
  const out = [];
  CLASSES.forEach((cls, i) => out.push({
    name: `class-${cls}`, character_class: cls,
    goal_difficulty: DIFFICULTIES[i % 3], logic_difficulty: LOGIC[i % 3],
  }));
  for (const difficulty of DIFFICULTIES) {
    for (const boss of BOSSES) {
      out.push({ name: `goal-${difficulty}-${boss}`, goal_difficulty: difficulty, goal_boss: boss });
      out.push({ name: `goal-${difficulty}-${boss}-all`, goal_difficulty: difficulty, goal_boss: boss, ...EVERYTHING });
    }
  }
  for (const boss of BOSSES) {
    for (const points of [20, 600]) {
      out.push({ name: `quests-${boss}-${points}`, goal_boss: boss, skill_points: points, logic_difficulty: 'strict', ...QUESTS_ONLY });
      out.push({ name: `quests-${boss}-${points}-all`, goal_boss: boss, skill_points: points, logic_difficulty: 'strict', ...QUESTS_ONLY, ...EVERYTHING });
    }
  }
  for (const logic of LOGIC) {
    out.push({ name: `logic-${logic}-hell-600`, character_class: 'sorceress', goal_difficulty: 'hell', skill_points: 600, logic_difficulty: logic });
  }
  for (const areas of [true, false]) {
    for (const levels of [true, false]) {
      out.push({ name: `checks-a${+areas}-l${+levels}`, goal_difficulty: 'hell', skill_points: 600,
        include_areas: areas, include_level_milestones: levels, key_items: true });
    }
  }
  for (const starting of [0, 5]) {
    out.push({ name: `starting-${starting}`, skill_points: 20, starting_skill_points: starting, logic_difficulty: 'strict', ...QUESTS_ONLY });
  }
  out.push({ name: 'keys-only', key_items: true });
  out.push({ name: 'stats-pooled', stat_points: 'pooled' });
  out.push({ name: 'runes-100', rune_percentage: 100, goal_difficulty: 'hell' });
  out.push({ name: 'traps-100', trap_percentage: 100 });
  out.push({ name: 'mod-options', xp_multiplier: 3, monster_shuffle: true, death_link: true });
  return out.map(c => ({ ...DEFAULTS, ...c }));
}

/** Several slots at once, so items have to cross between worlds, including another game. */
const MULTIWORLDS = [
  { name: 'multi-three-d2rr', slots: [
    { ...DEFAULTS, character_class: 'sorceress', goal_boss: 'andariel', ...EVERYTHING },
    { ...DEFAULTS, character_class: 'necromancer', goal_boss: 'mephisto', key_items: true },
    { ...DEFAULTS, character_class: 'warlock', goal_difficulty: 'nightmare', goal_boss: 'duriel', ...EVERYTHING },
  ] },
  { name: 'multi-with-checksfinder', other: 'ChecksFinder', slots: [
    { ...DEFAULTS, goal_boss: 'duriel', ...EVERYTHING },
  ] },
];

function yamlFor(c, slotName) {
  const options = Object.entries(c).filter(([k]) => k !== 'name')
    .map(([k, v]) => `  ${k}: ${v}`);
  return [`name: ${slotName}`, 'game: D2R Randomizer', 'D2R Randomizer:', ...options, ''].join('\n');
}

function generate(workDir, yamls) {
  const players = path.join(workDir, 'players');
  const out = path.join(workDir, 'out');
  fs.rmSync(players, { recursive: true, force: true });
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(players, { recursive: true });
  fs.mkdirSync(out, { recursive: true });
  yamls.forEach((y, i) => fs.writeFileSync(path.join(players, `slot${i}.yaml`), y));

  execFileSync(GENERATOR,
    ['--player_files_path', players, '--outputpath', out, '--spoiler', '2'],
    { encoding: 'utf-8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'pipe'] });

  const zips = fs.readdirSync(out).filter(f => f.endsWith('.zip'));
  if (zips.length === 0) throw new Error('generation produced no output archive');
  const archive = new AdmZip(path.join(out, zips[0]));
  const spoiler = archive.getEntries().find(e => e.entryName.endsWith('_Spoiler.txt'));
  if (!spoiler) throw new Error('output archive has no spoiler');
  return spoiler.getData().toString('utf-8');
}

/** `Location (Slot): Item (Slot)` lines of the spoiler's Locations section, and its playthrough spheres. */
function readSpoiler(text, multi) {
  const section = (from, to) => {
    const a = text.indexOf(`\n${from}`);
    if (a < 0) return '';
    const b = to ? text.indexOf(`\n${to}`, a + 1) : -1;
    return text.slice(a, b < 0 ? undefined : b);
  };
  const pair = line => {
    // Location names contain ": " themselves, item names never do: split at the LAST one.
    const m = /^(.*): (.*)$/.exec(line.trim());
    if (!m) return null;
    const strip = s => (multi ? s.replace(/ \(([^()]*)\)$/, '|$1') : `${s}|`);
    const [location, locSlot] = strip(m[1]).split('|');
    const [item, itemSlot] = strip(m[2]).split('|');
    return { location, locSlot, item, itemSlot };
  };
  const placements = section('Locations:', 'Playthrough:').split(/\r?\n/).slice(2).map(pair).filter(Boolean);
  const spheres = [];
  for (const line of section('Playthrough:', 'Paths:').split(/\r?\n/)) {
    if (/^\d+: \{/.test(line.trim())) spheres.push([]);
    else if (spheres.length && line.includes(': ')) {
      const p = pair(line);
      if (p) spheres[spheres.length - 1].push(p);
    }
  }
  return { placements, spheres };
}

function audit(c, slot, spoiler, multi) {
  const problems = [];
  const { placements, spheres } = readSpoiler(spoiler, multi);
  const mine = placements.filter(p => !multi || p.locSlot === slot);
  const forMe = placements.filter(p => !multi || p.itemSlot === slot);
  if (mine.length === 0) return ['spoiler lists no locations for this slot'];

  const goalDifficulty = DIFFICULTIES.indexOf(c.goal_difficulty);
  const goalAct = BOSSES.indexOf(c.goal_boss);
  const goalEvent = `${title(c.goal_boss)} Defeated (${title(c.goal_difficulty)})`;
  const order = spheres.flatMap((s, i) => s.filter(p => !multi || p.itemSlot === slot).map(p => ({ ...p, sphere: i })));
  const goalAt = order.find(p => p.item === goalEvent);
  if (!goalAt) problems.push(`the playthrough never collects "${goalEvent}"`);

  // Nothing past the goal may be a location.
  for (const p of mine) {
    const m = /^(Normal|Nightmare|Hell) (?:A(\d)|WP|Area)/.exec(p.location);
    if (!m) continue;
    const d = DIFFICULTIES.indexOf(m[1].toLowerCase());
    if (d > goalDifficulty || (d === goalDifficulty && m[2] && Number(m[2]) - 1 > goalAct)) {
      problems.push(`location past the goal: ${p.location}`);
      break;
    }
  }

  const count = name => forMe.filter(p => p.item === name).length;
  const needKeys = !c.key_items ? 0 : (goalDifficulty > 0 || goalAct >= 2) ? 5 : goalAct === 1 ? 2 : 0;
  if (count('Progressive Horadric Key') !== needKeys) {
    problems.push(`${count('Progressive Horadric Key')} keys in the pool, the goal needs ${needKeys}`);
  }
  if (needKeys && goalAt) {
    const before = order.filter(p => p.item === 'Progressive Horadric Key' && p.sphere <= goalAt.sphere).length;
    if (before < needKeys) problems.push(`the playthrough reaches the goal holding ${before} of ${needKeys} keys`);
  }
  const has = pattern => forMe.some(p => pattern.test(p.item));
  // On the smallest slots there may be no room left for optional items at all.
  const roomy = mine.length >= 60;
  if (roomy && (c.stat_points === 'pooled') !== has(/^Stat Points$/)) problems.push('stat point items do not match the option');
  if (roomy && (c.rune_percentage > 0) !== has(/ Rune$/)) problems.push('rune items do not match the option');
  if (roomy && (c.trap_percentage > 0) !== has(/ Trap$/)) problems.push('trap items do not match the option');
  if (!has(/^Progressive Skill Point$/) && c.starting_skill_points === 0) problems.push('no skill point is placed');

  return { problems, locations: mine.length, spheres: spheres.length };
}

function reportFailure(err) {
  const detail = [err.stdout, err.stderr, err.message].filter(Boolean).join('\n');
  // Drop the noise Archipelago always emits so the real cause is visible.
  const lines = detail.split(/\r?\n/)
    .filter(l => l.trim())
    .filter(l => !/pkg_resources|UserWarning|setuptools|bad magic number|ImportError: bad/i.test(l));
  console.log(' FAIL');
  lines.slice(-6).forEach(l => console.log(`      ${l.slice(0, 180)}`));
}

function main() {
  if (!fs.existsSync(GENERATOR)) {
    console.error(`Archipelago generator not found at ${GENERATOR}`);
    console.error('Set ARCHIPELAGO_DIR if it is installed elsewhere.');
    process.exit(2);
  }

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'd2rr-fill-'));
  const selected = process.argv.indexOf('--case');
  const only = selected < 0 ? null : process.argv[selected + 1];
  const singles = cases().filter(c => !only || c.name === only);
  const multis = MULTIWORLDS.filter(m => !only || m.name === only);
  if (!singles.length && !multis.length) throw new Error('Unknown --case');
  console.log(`Generating ${singles.length + multis.length} multiworlds with ${GENERATOR}\n`);

  let failed = 0;
  for (const c of singles) {
    process.stdout.write(`  ${c.name.padEnd(30)}`);
    try {
      const result = audit(c, 'Solo', generate(workDir, [yamlFor(c, 'Solo')]), false);
      if (result.problems.length) {
        console.log(` AUDIT (${result.locations} locations)`);
        result.problems.forEach(p => console.log(`      ${p}`));
        failed++;
      } else {
        console.log(` ok (${result.locations} locations, ${result.spheres} spheres)`);
      }
    } catch (err) {
      reportFailure(err);
      failed++;
    }
  }
  for (const m of multis) {
    process.stdout.write(`  ${m.name.padEnd(30)}`);
    try {
      const yamls = m.slots.map((c, i) => yamlFor(c, `Slot${i + 1}`));
      if (m.other) yamls.push(`name: Other\ngame: ${m.other}\n${m.other}: {}\n`);
      const spoiler = generate(workDir, yamls);
      const results = m.slots.map((c, i) => audit(c, `Slot${i + 1}`, spoiler, true));
      const problems = results.flatMap((r, i) => (r.problems ?? r).map(p => `Slot${i + 1}: ${p}`));
      // In a real multiworld some of each slot's items must sit in somebody else's world.
      const crossed = /\((Slot\d|Other)\): .*\((Slot\d|Other)\)/.test(spoiler)
        && spoiler.split(/\r?\n/).some(l => { const x = /\((Slot\d|Other)\): .*\((Slot\d|Other)\)$/.exec(l); return x && x[1] !== x[2]; });
      if (!crossed) problems.push('no item crossed between worlds');
      if (problems.length) {
        console.log(' AUDIT');
        problems.forEach(p => console.log(`      ${p}`));
        failed++;
      } else {
        console.log(` ok (${results.map(r => r.locations).join(' + ')} locations)`);
      }
      if (VERBOSE) console.log(spoiler.slice(0, 1500));
    } catch (err) {
      reportFailure(err);
      failed++;
    }
  }

  fs.rmSync(workDir, { recursive: true, force: true });

  const total = singles.length + multis.length;
  if (failed) {
    console.error(`\n${failed}/${total} multiworlds failed.`);
    process.exit(1);
  }
  console.log(`\nAll ${total} multiworlds generated and passed the logic audit.`);
}

main();
