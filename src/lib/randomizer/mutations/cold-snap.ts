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
 * THE COLD RESISTANCE. Difficulty penalties (difficultylevels.txt) lower every
 * resistance at once, so the −10 cold rides on a hidden passive skill instead:
 * a new skills.txt row, appended after every other row so no skill id moves,
 * given to every class through its first free charstats "Skill N" starting-skill
 * slot (the Barbarian, with the most, uses 9 of 10). Starting skills are learned at
 * level 1, and passive = 1 makes the game apply passivestat coldresist = −10. It is
 * carried on the `resistmagic` state, a blank vanilla state that no skill, item or
 * monster uses (Resist Cold's own passive_resistcold can't be shared: two skills on
 * one state overwrite each other's stats). Passive skills are never offered as
 * left/right skills, and it has no tree slot, so players never see it. It shows on
 * the character sheet: −10 in Normal, −50 in Nightmare, −110 in Hell.
 * Seen in game (Normal): passive = 1 is required; without it the stat isn't applied.
 * Unsummon itself can't carry it: passive = 1 would take it off the skill bar.
 */

export const COLD_MOD = 18;
const COLD_WEIGHT = '10000';
const UPICK_COLS = ['upick', 'upick (N)', 'upick (H)'];
const CPICK_COLS = ['cpick', 'cpick (N)', 'cpick (H)'];
const MOD_COLS = ['Mod1', 'Mod2', 'Mod3'];

export const COLD_RESIST_PENALTY = 10;
export const COLD_RESIST_SKILL = 'D2RR Cold Snap';
const COLD_RESIST_STATE = 'resistmagic';
const SKILL_SLOTS = Array.from({ length: 10 }, (_, i) => `Skill ${i + 1}`);

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

  // −10 cold resistance through a hidden passive starting skill.
  const { headers: kh, rows: kr } = ctx.skills;
  const k = (name: string) => {
    const i = kh.indexOf(name);
    if (i === -1) throw new Error(`Cold Snap: skills.txt has no ${name} column`);
    return i;
  };
  if (kr.some(r => r[0] === COLD_RESIST_SKILL)) throw new Error('Cold Snap: applied twice');
  if (kr.some(r => [r[k('passivestate')], r[k('aurastate')]].includes(COLD_RESIST_STATE))) {
    throw new Error(`Cold Snap: a skill already uses the ${COLD_RESIST_STATE} state`);
  }
  const ids = kr.map(r => Number(r[k('*Id')])).filter(Number.isFinite);
  const row = kh.map(() => '');
  const set = (col: string, value: string) => { row[k(col)] = value; };
  set('skill', COLD_RESIST_SKILL);
  set('*Id', String(Math.max(...ids) + 1));
  set('passive', '1');
  set('passivestate', COLD_RESIST_STATE);
  set('passivestat1', 'coldresist');
  // Binary minus: the calc parser's unary minus is not relied on.
  set('passivecalc1', `0-${COLD_RESIST_PENALTY}`);
  // The bookkeeping columns a vanilla passive (Natural Resistance) carries.
  for (const [col, value] of [['range', 'none'], ['anim', 'SC'], ['seqtrans', 'SC'], ['monanim', 'xx'],
    ['reqlevel', '1'], ['maxlvl', '1'], ['leftskill', '0'], ['rightskill', '0'], ['attackrank', '0'],
    ['mana', '0'], ['minmana', '0'], ['manashift', '8'], ['lvlmana', '0'], ['HitShift', '8'], ['InGame', '1']] as const) {
    set(col, value);
  }
  if (kh.includes('*eol')) set('*eol', '0');
  kr.push(row);

  const { headers: ch, rows: cr } = ctx.charstats;
  const slots = SKILL_SLOTS.map(c => ch.indexOf(c));
  if (slots.includes(-1)) throw new Error('Cold Snap: charstats.txt is missing Skill 1–10');
  for (const r of cr) {
    const cls = r[ch.indexOf('class')];
    if (!cls || cls === 'Expansion') continue;
    const free = slots.find(i => !r[i]);
    if (free === undefined) throw new Error(`Cold Snap: ${cls} has no free starting-skill slot`);
    r[free] = COLD_RESIST_SKILL;
  }
}
