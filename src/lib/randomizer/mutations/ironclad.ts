import type { MutationContext } from './index';

const AC_MULT = 3;

export function applyIronclad(ctx: MutationContext): void {
  const { headers: mh, rows: mr } = ctx.monstats;
  const cols = ['AC', 'AC(N)', 'AC(H)'].map(c => mh.indexOf(c)).filter(i => i !== -1);
  if (cols.length === 0) return;

  for (const row of mr) {
    if (!row[0]) continue;
    for (const idx of cols) {
      const val = parseInt(row[idx], 10);
      if (!isNaN(val) && val > 0) row[idx] = String(Math.round(val * AC_MULT));
    }
  }
}
