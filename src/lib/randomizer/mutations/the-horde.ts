import type { MutationContext } from './index';

const MULT = 3;
const MAX_GRP = 15;

// 4/3 threshold multiplier = 3/4 effective XP rate
const XP_MULT = 4 / 3;
const SKIP_COLS = new Set(['Level', 'ExpRatio']);

export function applyTheHorde(ctx: MutationContext): void {
  const { headers: mh, rows: mr } = ctx.monstats;
  const minGrpIdx = mh.indexOf('MinGrp');
  const maxGrpIdx = mh.indexOf('MaxGrp');
  if (minGrpIdx === -1 || maxGrpIdx === -1) return;

  for (const row of mr) {
    if (!row[0]) continue;
    const minVal = parseInt(row[minGrpIdx], 10);
    const maxVal = parseInt(row[maxGrpIdx], 10);
    if (!isNaN(minVal) && minVal > 0)
      row[minGrpIdx] = String(Math.min(MAX_GRP, minVal * MULT));
    if (!isNaN(maxVal) && maxVal > 0)
      row[maxGrpIdx] = String(Math.min(MAX_GRP, maxVal * MULT));
  }

  const { headers: eh, rows: er } = ctx.experience;
  for (const row of er) {
    for (let i = 0; i < eh.length; i++) {
      if (SKIP_COLS.has(eh[i])) continue;
      const val = parseInt(row[i], 10);
      if (!isNaN(val) && val > 0) row[i] = String(Math.round(val * XP_MULT));
    }
  }
}
