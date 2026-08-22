import type { MutationContext } from './index';
import { scaleIntCell } from './util';

/**
 * Band of Brothers — the hireling is the hero and the player is the support.
 *
 * MERC
 * Base Dmg-Min/Dmg-Max are small next to an equipped weapon (a Rogue Scout at
 * level 49 has a base of 19–21), so raising them alone front-loads the buff into
 * the early game and fades out later. Dmg/Lvl is the column that keeps the merc
 * relevant at level 80, so both are scaled. HP, Defense and AR carry the rest —
 * a merc that survives Hell is what actually changes how the week plays.
 *
 * Skill levels are raised through Level1–6 / LvlPerLvl1–6 only. The skill NAMES
 * are left completely alone: hireling-writer.ts has already assigned randomized
 * attack skills and an aura drawn from this seed's placements, and rewriting a
 * name here would both fight that system and risk pointing a merc at a
 * substituted row (the monster-skill crash, hireling side). Raising a level on
 * an existing reference introduces no new name and therefore no new risk.
 *
 * PLAYER
 * The cost is LifePerVitality, not skill points. SkillsPerLevel is an integer 1
 * for every class, and D2R's parser reads a fractional cell by accumulating
 * digits (val = val*10 + c-'0'), so "0.5" would resolve to -15 rather than a half
 * point — see util.ts. A squishier player also reinforces the design instead of
 * merely taxing it: you want to be standing behind the merc.
 *
 * 0.75 rather than 0.5 deliberately. LifePerVitality is in quarter-units, so
 * Sorceress/Necromancer/Druid sit at 8 (= 2 life per point); halving puts them at
 * 1 life per vitality point and makes the stat not worth buying at all for three
 * classes. At 0.75 every class keeps a reason to invest, and 12→9 / 16→12 / 8→6
 * are all exact integers.
 */

// Hireling combat scaling.
const MERC_HP_MULT      = 2.5;
const MERC_DEF_MULT     = 2.0;
const MERC_AR_MULT      = 1.5;
const MERC_DMG_MULT     = 2.5;
// Skill levels — "a bit". An aura scales hard with level, so this stays modest.
const MERC_SKILL_LVL_MULT = 1.5;

// Player cost.
const LIFE_PER_VIT_MULT = 0.75;

const MERC_HP_COLS  = ['HP', 'HP/Lvl'];
const MERC_DEF_COLS = ['Defense', 'Def/Lvl'];
const MERC_AR_COLS  = ['AR', 'AR/Lvl'];
const MERC_DMG_COLS = ['Dmg-Min', 'Dmg-Max', 'Dmg/Lvl'];

const MERC_SKILL_LVL_COLS: string[] = [];
for (let i = 1; i <= 6; i++) {
  MERC_SKILL_LVL_COLS.push(`Level${i}`, `LvlPerLvl${i}`);
}

export function applyBandOfBrothers(ctx: MutationContext): void {
  // ── Hireling: survivability, accuracy, damage, skill levels ──────────────
  const { headers: hh, rows: hr } = ctx.hireling;

  const scaleGroups: [string[], number][] = [
    [MERC_HP_COLS,          MERC_HP_MULT],
    [MERC_DEF_COLS,         MERC_DEF_MULT],
    [MERC_AR_COLS,          MERC_AR_MULT],
    [MERC_DMG_COLS,         MERC_DMG_MULT],
    [MERC_SKILL_LVL_COLS,   MERC_SKILL_LVL_MULT],
  ];

  for (const row of hr) {
    if (!row[0]) continue;
    for (const [cols, mult] of scaleGroups) {
      for (const col of cols) {
        const idx = hh.indexOf(col);
        if (idx === -1) continue;
        scaleIntCell(row, idx, mult);
      }
    }
  }

  // ── Player: less life per vitality point ─────────────────────────────────
  const { headers: ch, rows: cr } = ctx.charstats;
  const vitIdx = ch.indexOf('LifePerVitality');
  if (vitIdx === -1) return;

  for (const row of cr) {
    if (!row[0]) continue;
    scaleIntCell(row, vitIdx, LIFE_PER_VIT_MULT);
  }
}
