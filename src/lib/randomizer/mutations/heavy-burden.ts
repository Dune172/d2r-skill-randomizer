import type { MutationContext } from './index';

const REQ_MULT = 1.5;
const DEF_MULT = 1.5;

const REQ_COLS = ['reqstr'];
const DEF_COLS = ['minac', 'maxac'];

export function applyHeavyBurden(ctx: MutationContext): void {
  const { headers: ah, rows: ar } = ctx.armor;

  const reqIdxs = REQ_COLS.map(c => ah.indexOf(c)).filter(i => i !== -1);
  const defIdxs = DEF_COLS.map(c => ah.indexOf(c)).filter(i => i !== -1);

  for (const row of ar) {
    // Only buff defense on armor that has a strength requirement
    const hasReq = reqIdxs.some(idx => parseInt(row[idx], 10) > 0);

    for (const idx of reqIdxs) {
      const val = parseInt(row[idx], 10);
      if (!isNaN(val) && val > 0) row[idx] = String(Math.ceil(val * REQ_MULT));
    }
    if (hasReq) {
      for (const idx of defIdxs) {
        const val = parseInt(row[idx], 10);
        if (!isNaN(val) && val > 0) row[idx] = String(Math.round(val * DEF_MULT));
      }
    }
  }
}
