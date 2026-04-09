import type { MutationContext } from './index';

const MULT = 3;
const MAX_GRP = 15;

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
}
