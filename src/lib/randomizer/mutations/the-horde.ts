import type { MutationContext } from './index';
import { EXP_COLS } from '../players-scaler';

const MULT = 3;
const MAX_GRP = 15;

// Reduce XP per kill to 3/4 of normal (more monsters, but less XP each)
const XP_MULT = 3 / 4;

export function applyTheHorde(ctx: MutationContext): void {
  const { headers: mh, rows: mr } = ctx.monstats;
  const minGrpIdx = mh.indexOf('MinGrp');
  const maxGrpIdx = mh.indexOf('MaxGrp');
  if (minGrpIdx === -1 || maxGrpIdx === -1) return;

  const expIdxs = EXP_COLS.map(c => mh.indexOf(c)).filter(i => i !== -1);

  for (const row of mr) {
    if (!row[0]) continue;
    const minVal = parseInt(row[minGrpIdx], 10);
    const maxVal = parseInt(row[maxGrpIdx], 10);
    if (!isNaN(minVal) && minVal > 0)
      row[minGrpIdx] = String(Math.min(MAX_GRP, minVal * MULT));
    if (!isNaN(maxVal) && maxVal > 0)
      row[maxGrpIdx] = String(Math.min(MAX_GRP, maxVal * MULT));
    for (const idx of expIdxs) {
      const val = parseInt(row[idx], 10);
      if (!isNaN(val) && val > 0)
        row[idx] = String(Math.max(1, Math.round(val * XP_MULT)));
    }
  }
}
