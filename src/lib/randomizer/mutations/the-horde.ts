import type { MutationContext } from './index';
import { EXP_COLS, TC_COL, ACT_RE, BOSS_ACTS } from '../players-scaler';

// Pack size multiplier. Previously 3× — dialed back 20% to 2.4× so large
// packs don't feel overwhelming while still noticeably swarmier than vanilla.
const MULT = 2.4;
const MAX_GRP = 15;

// Reduce XP per kill to 2/3 of normal (more monsters, but less XP each)
const XP_MULT = 2 / 3;

// Reduce non-boss enemy damage to 2/3 of normal (−1/3) — swarms shouldn't
// overwhelm the player just because there are more of them. Bosses (boss=1)
// keep full damage so they stay threatening.
const DMG_MULT = 2 / 3;

// Min/max attack-damage columns across all three difficulties (A1/A2/S1) plus
// the elemental-attack damage columns. To-hit (TH) columns are left untouched.
const DMG_COLS = [
  'A1MinD',     'A1MaxD',     'A2MinD',     'A2MaxD',     'S1MinD',     'S1MaxD',
  'A1MinD(N)',  'A1MaxD(N)',  'A2MinD(N)',  'A2MaxD(N)',  'S1MinD(N)',  'S1MaxD(N)',
  'A1MinD(H)',  'A1MaxD(H)',  'A2MinD(H)',  'A2MaxD(H)',  'S1MinD(H)',  'S1MaxD(H)',
  'El1MinD',    'El1MaxD',    'El2MinD',    'El2MaxD',    'El3MinD',    'El3MaxD',
  'El1MinD(N)', 'El1MaxD(N)', 'El2MinD(N)', 'El2MaxD(N)', 'El3MinD(N)', 'El3MaxD(N)',
  'El1MinD(H)', 'El1MaxD(H)', 'El2MinD(H)', 'El2MaxD(H)', 'El3MinD(H)', 'El3MaxD(H)',
];

export function applyTheHorde(ctx: MutationContext): void {
  const { headers: mh, rows: mr } = ctx.monstats;
  const minGrpIdx = mh.indexOf('MinGrp');
  const maxGrpIdx = mh.indexOf('MaxGrp');
  if (minGrpIdx === -1 || maxGrpIdx === -1) return;

  const tcIdx = mh.indexOf(TC_COL);
  const bossIdx = mh.indexOf('boss');
  const expIdxs = EXP_COLS.map(c => mh.indexOf(c)).filter(i => i !== -1);
  const dmgIdxs = DMG_COLS.map(c => mh.indexOf(c)).filter(i => i !== -1);

  for (const row of mr) {
    const id = row[0];
    if (!id) continue;
    const tc = tcIdx !== -1 ? (row[tcIdx] ?? '') : '';
    if (!ACT_RE.test(tc) && !(id in BOSS_ACTS)) continue;
    const minVal = parseInt(row[minGrpIdx], 10);
    const maxVal = parseInt(row[maxGrpIdx], 10);
    if (!isNaN(minVal) && minVal > 0)
      row[minGrpIdx] = String(Math.min(MAX_GRP, Math.round(minVal * MULT)));
    if (!isNaN(maxVal) && maxVal > 0)
      row[maxGrpIdx] = String(Math.min(MAX_GRP, Math.round(maxVal * MULT)));
    for (const idx of expIdxs) {
      const val = parseInt(row[idx], 10);
      if (!isNaN(val) && val > 0)
        row[idx] = String(Math.max(1, Math.round(val * XP_MULT)));
    }
    // Damage reduction applies only to non-bosses (boss column blank/0).
    const isBoss = bossIdx !== -1 && row[bossIdx] === '1';
    if (!isBoss) {
      for (const idx of dmgIdxs) {
        const val = parseInt(row[idx], 10);
        if (!isNaN(val) && val > 0)
          row[idx] = String(Math.max(1, Math.round(val * DMG_MULT)));
      }
    }
  }
}
