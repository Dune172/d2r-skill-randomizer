import type { MutationContext } from './index';

/**
 * Cold Snap — elites burst into a frost nova when they die, and the cold bites
 * harder.
 *
 * THE NOVA IS COLD ENCHANTED. The death frost nova has no data hook of its own:
 * it is the hard-coded behaviour of the "cold" monster modifier (monumod.txt row
 * 18), which also adds cold damage to the monster's attacks. So every elite gets
 * that modifier:
 *
 *  - Unique monsters roll their random modifiers from monumod's upick weights.
 *    Cold's weight (vanilla 6, beside ~13 other rows also near 6) is raised far
 *    above the rest, so it is almost always the first pick. The remaining picks
 *    (Nightmare and Hell roll more) stay random, so uniques keep their variety.
 *    cold has xfer = 1, so a unique's minions carry it too.
 *  - Champion packs roll exactly one champion type (champion, ghostly, fanatic,
 *    possessed, berserk: rows with champion = 1 and a cpick weight). Cold is
 *    made a champion type and given the same overwhelming weight, so nearly every
 *    champion pack is a Cold Enchanted champion instead. EXPERIMENTAL: vanilla
 *    never rolls a non-champion-type row for champions; this has not been seen
 *    in play.
 *  - Superuniques have fixed modifiers (superuniques.txt Mod1–3). Cold goes into
 *    the first empty slot; a full row gives up a disabled modifier if it has one,
 *    otherwise its last slot.
 *
 * Weights are WORD fields in the game's table, so 10000 is in range; at that
 * weight cold wins the first pick about 99% of the time.
 *
 * THE COLD BITE. Every monster's cold damage pierces 10 cold resistance:
 * monprop.txt property pierce-cold (stat passive_cold_pierce, "-x% to enemy cold
 * resistance") at 10 in every difficulty, the attacker-side monster stat family
 * vanilla already uses here (the Council's extra-fire). Monsters with no MonProp
 * row get the new d2rr_coldsnap row; monsters that have one get the property in a
 * free slot of it. Player summons (skills.txt "summon") and mercenaries are left
 * out. Unlike a resistance penalty it shows nowhere and needs no reload; it bites
 * after the 75% cap, so a capped character takes cold as if at 65%.
 * NOT SEEN IN PLAY: whether the engine honours a monster's pierce against a
 * player can only be seen by taking cold damage outside town.
 * (It replaced a −10 cold resistance passive that only applied from a new
 * character's first reload.)
 */

export const COLD_MOD = 18;
const COLD_WEIGHT = '10000';
const UPICK_COLS = ['upick', 'upick (N)', 'upick (H)'];
const CPICK_COLS = ['cpick', 'cpick (N)', 'cpick (H)'];
const MOD_COLS = ['Mod1', 'Mod2', 'Mod3'];

export const COLD_PIERCE = 10;
export const COLD_SNAP_MONPROP = 'd2rr_coldsnap';
const PIERCE_PROP = 'pierce-cold';
const MERCENARIES = new Set(['roguehire', 'act2hire', 'act3hire', 'act5hire1', 'act5hire2']);
const MONPROP_DIFFS = ['', ' (N)', ' (H)'];
const MONPROP_SLOTS = 6;

export function applyColdSnap(ctx: MutationContext): void {
  // Unique and champion modifier weights.
  const { headers: uh, rows: ur } = ctx.monumod;
  const col = (name: string) => {
    const i = uh.indexOf(name);
    if (i === -1) throw new Error(`Cold Snap: monumod.txt has no ${name} column`);
    return i;
  };
  const cold = ur.find(r => r[col('id')] === String(COLD_MOD));
  if (!cold || cold[col('uniquemod')] !== 'cold') throw new Error('Cold Snap: monumod.txt row 18 is not "cold"');
  for (const c of UPICK_COLS) cold[col(c)] = COLD_WEIGHT;
  for (const c of CPICK_COLS) cold[col(c)] = COLD_WEIGHT;
  cold[col('champion')] = '1';

  // Superuniques.
  const { headers: sh, rows: sr } = ctx.superuniques;
  const modIdx = MOD_COLS.map(c => sh.indexOf(c));
  if (modIdx.includes(-1)) throw new Error('Cold Snap: superuniques.txt is missing Mod1–3');
  const enabled = new Map(ur.map(r => [r[col('id')], r[col('enabled')] === '1']));
  for (const row of sr) {
    if (!row[sh.indexOf('Class')]) continue; // "Expansion" divider
    const mods = modIdx.map(i => row[i] ?? '');
    if (mods.includes(String(COLD_MOD))) continue;
    let slot = mods.findIndex(m => !m || m === '0');
    if (slot === -1) slot = mods.findIndex(m => !enabled.get(m));
    if (slot === -1) slot = mods.length - 1;
    row[modIdx[slot]] = String(COLD_MOD);
  }

  applyColdPierce(ctx);
}

/** Every hostile monster's cold damage pierces COLD_PIERCE cold resistance (monprop.txt). */
function applyColdPierce(ctx: MutationContext): void {
  const { headers: mh, rows: mr } = ctx.monstats;
  const { headers: ph, rows: pr } = ctx.monprop;
  const monPropCol = mh.indexOf('MonProp');
  if (monPropCol === -1) throw new Error('Cold Snap: monstats.txt has no MonProp column');
  const p = (name: string) => {
    const i = ph.indexOf(name);
    if (i === -1) throw new Error(`Cold Snap: monprop.txt has no ${name} column`);
    return i;
  };
  if (pr.some(r => r[0] === COLD_SNAP_MONPROP)) throw new Error('Cold Snap: applied twice');

  const summonCol = ctx.skills.headers.indexOf('summon');
  const summons = new Set(summonCol === -1 ? [] : ctx.skills.rows.map(r => r[summonCol]).filter(Boolean));

  /** Put pierce-cold 10 into a free slot of each difficulty; throws if a row is full. */
  const addPierce = (row: string[]) => {
    for (const d of MONPROP_DIFFS) {
      const slots = Array.from({ length: MONPROP_SLOTS }, (_, i) => i + 1);
      if (slots.some(i => row[p(`prop${i}${d}`)] === PIERCE_PROP)) continue;
      const free = slots.find(i => !row[p(`prop${i}${d}`)]);
      if (free === undefined) throw new Error(`Cold Snap: monprop row ${row[0]} has no free${d} slot`);
      row[p(`prop${free}${d}`)] = PIERCE_PROP;
      row[p(`chance${free}${d}`)] = '100';
      row[p(`par${free}${d}`)] = '';
      row[p(`min${free}${d}`)] = String(COLD_PIERCE);
      row[p(`max${free}${d}`)] = String(COLD_PIERCE);
    }
  };

  const own = ph.map(() => '');
  own[0] = COLD_SNAP_MONPROP;
  if (ph.includes('*eol')) own[p('*eol')] = '0';
  addPierce(own);
  pr.push(own);

  const byId = new Map(pr.map(r => [r[0], r]));
  const extended = new Set<string>();
  for (const row of mr) {
    const id = row[0];
    if (!id || id === 'Expansion' || summons.has(id) || MERCENARIES.has(id)) continue;
    const existing = row[monPropCol];
    const target = existing ? byId.get(existing) : undefined;
    if (!target) { row[monPropCol] = COLD_SNAP_MONPROP; continue; }
    if (!extended.has(existing)) { addPierce(target); extended.add(existing); }
  }
}
