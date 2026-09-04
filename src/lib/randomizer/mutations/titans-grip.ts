import type { MutationContext } from './index';
import { INJECTED_PROC_PARAM } from '../item-skills-writer';

// +30%, not +50%. Weapon requirements are far tighter than armor's: an elite
// weapon already asks for most of a melee character's stat budget, and at 1.5x
// the good bases sat out of reach for so long that the ×2 damage they carry
// never got used. 1.3x still costs real stat points without gating the base.
const REQ_MULT = 1.3;
const DMG_MULT = 2.0;
const PROC_CHANCE_CAP = 100;

// Base on-strike chance for a freshly injected weapon proc. doubleWeaponProcs
// runs afterward (post-remap) and doubles it, so the in-game chance is 2×.
const INJECT_PROC_CHANCE = 5;

const REQ_COLS = ['reqstr', 'reqdex'];
const DMG_COLS = ['mindam', 'maxdam', '2handmindam', '2handmaxdam'];

const WEAPON_ITYPES = new Set([
  'weap', 'mele', 'miss', 'thro', 'bow', 'xbow',
  'h2h', 'h2h2', 'rod', 'staf', 'wand', 'scep', 'orb',
]);

const CHANCE_PROC_CODES = new Set([
  'hit-skill',     'hit-skill-noc',
  'att-skill',     'att-skill-noc',
  'gethit-skill',  'gethit-skill-noc',
  'kill-skill',    'kill-skill-noc',
  'death-skill',   'death-skill-noc',
  'levelup-skill', 'levelup-skill-noc',
]);

// Any proc code (CTC family + charged) — used to detect affixes that already
// proc, so injection doesn't stack a second one.
const ANY_PROC_CODES = new Set([...CHANCE_PROC_CODES, 'charged']);

function procSkillLevel(affixLevel: number): number {
  return Math.min(20, Math.max(1, Math.floor(affixLevel / 7)));
}

/**
 * Inject a hit-skill (chance-to-cast-on-striking) proc into every weapon-
 * applicable affix that doesn't already proc. Runs on raw (pre-remap) affix
 * data; the sentinel param makes remapClassItemSkills assign a random skill
 * from the shuffled castable pool. doubleWeaponProcs later doubles the chance.
 */
export function injectWeaponProcs(headers: string[], rows: string[][]): void {
  const itypeIdxs = ['itype1','itype2','itype3','itype4','itype5','itype6','itype7']
    .map(c => headers.indexOf(c)).filter(i => i !== -1);
  const levelIdx = headers.indexOf('level');

  type ModSlot = { code: number; min: number; max: number; param: number };
  const modSlots: ModSlot[] = [1, 2, 3].map(slot => ({
    code:  headers.indexOf(`mod${slot}code`),
    min:   headers.indexOf(`mod${slot}min`),
    max:   headers.indexOf(`mod${slot}max`),
    param: headers.indexOf(`mod${slot}param`),
  })).filter(s => s.code !== -1 && s.min !== -1 && s.max !== -1 && s.param !== -1);

  for (const row of rows) {
    if (!itypeIdxs.some(i => WEAPON_ITYPES.has(row[i] ?? ''))) continue;
    if (modSlots.some(s => ANY_PROC_CODES.has(row[s.code] ?? ''))) continue;
    const free = modSlots.find(s => !row[s.code]?.trim());
    if (!free) continue;
    const affixLevel = levelIdx !== -1 ? (parseInt(row[levelIdx], 10) || 1) : 1;
    row[free.code]  = 'hit-skill';
    row[free.min]   = String(INJECT_PROC_CHANCE);
    row[free.max]   = String(procSkillLevel(affixLevel));
    row[free.param] = INJECTED_PROC_PARAM;
  }
}

function doubleWeaponProcs(headers: string[], rows: string[][]): void {
  const itypeIdxs = ['itype1','itype2','itype3','itype4','itype5','itype6','itype7']
    .map(c => headers.indexOf(c)).filter(i => i !== -1);
  const levelIdx = headers.indexOf('level');

  for (const row of rows) {
    if (!itypeIdxs.some(i => WEAPON_ITYPES.has(row[i] ?? ''))) continue;
    const affixLevel = levelIdx !== -1 ? (parseInt(row[levelIdx], 10) || 1) : 1;
    const skillLevel = procSkillLevel(affixLevel);
    for (let slot = 1; slot <= 3; slot++) {
      const codeIdx = headers.indexOf(`mod${slot}code`);
      const minIdx  = headers.indexOf(`mod${slot}min`);
      const maxIdx  = headers.indexOf(`mod${slot}max`);
      if (codeIdx === -1 || minIdx === -1 || maxIdx === -1) continue;
      if (!CHANCE_PROC_CODES.has(row[codeIdx] ?? '')) continue;
      const minVal = parseInt(row[minIdx], 10);
      if (!isNaN(minVal) && minVal > 0) row[minIdx] = String(Math.min(PROC_CHANCE_CAP, minVal * 2));
      // Raise the proc skill level toward item-level scaling, but never lower
      // an affix that already procs a higher-level skill.
      const maxVal = parseInt(row[maxIdx], 10);
      row[maxIdx] = String(Math.max(isNaN(maxVal) ? 0 : maxVal, skillLevel));
    }
  }
}

export function applyTitansGrip(ctx: MutationContext): void {
  const { headers: wh, rows: wr } = ctx.weapons;

  const reqIdxs = REQ_COLS.map(c => wh.indexOf(c)).filter(i => i !== -1);
  const dmgIdxs = DMG_COLS.map(c => wh.indexOf(c)).filter(i => i !== -1);

  for (const row of wr) {
    // Only buff damage on weapons that have a strength or dexterity requirement
    const hasReq = reqIdxs.some(idx => parseInt(row[idx], 10) > 0);

    for (const idx of reqIdxs) {
      const val = parseInt(row[idx], 10);
      if (!isNaN(val) && val > 0) row[idx] = String(Math.ceil(val * REQ_MULT));
    }
    if (hasReq) {
      for (const idx of dmgIdxs) {
        const val = parseInt(row[idx], 10);
        if (!isNaN(val) && val > 0) row[idx] = String(Math.round(val * DMG_MULT));
      }
    }
  }

  doubleWeaponProcs(ctx.magicprefix.headers, ctx.magicprefix.rows);
  doubleWeaponProcs(ctx.magicsuffix.headers, ctx.magicsuffix.rows);
}
