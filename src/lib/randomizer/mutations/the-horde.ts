import type { MutationContext } from './index';
import { EXP_COLS, TC_COL, ACT_RE, BOSS_ACTS } from '../players-scaler';

// Pack size multiplier. Previously 3× — dialed back 20% to 2.4× so large
// packs don't feel overwhelming while still noticeably swarmier than vanilla.
const MULT = 2.4;
const MAX_GRP = 15;

// Reduce XP per kill to 1/2 of normal (more monsters, but less XP each)
const XP_MULT = 1 / 2;

export function applyTheHorde(ctx: MutationContext): void {
  const { headers: mh, rows: mr } = ctx.monstats;
  const minGrpIdx = mh.indexOf('MinGrp');
  const maxGrpIdx = mh.indexOf('MaxGrp');
  if (minGrpIdx === -1 || maxGrpIdx === -1) return;

  const tcIdx = mh.indexOf(TC_COL);
  const expIdxs = EXP_COLS.map(c => mh.indexOf(c)).filter(i => i !== -1);

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
  }
}
