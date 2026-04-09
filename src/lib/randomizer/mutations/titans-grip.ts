import type { MutationContext } from './index';

const REQ_MULT = 1.5;
const DMG_MULT = 1.3;

const REQ_COLS = ['reqstr', 'reqdex'];
const DMG_COLS = ['mindam', 'maxdam', '2handmindam', '2handmaxdam'];

export function applyTitansGrip(ctx: MutationContext): void {
  const { headers: wh, rows: wr } = ctx.weapons;

  const reqIdxs = REQ_COLS.map(c => wh.indexOf(c)).filter(i => i !== -1);
  const dmgIdxs = DMG_COLS.map(c => wh.indexOf(c)).filter(i => i !== -1);

  for (const row of wr) {
    for (const idx of reqIdxs) {
      const val = parseInt(row[idx], 10);
      if (!isNaN(val) && val > 0) row[idx] = String(Math.ceil(val * REQ_MULT));
    }
    for (const idx of dmgIdxs) {
      const val = parseInt(row[idx], 10);
      if (!isNaN(val) && val > 0) row[idx] = String(Math.round(val * DMG_MULT));
    }
  }
}
