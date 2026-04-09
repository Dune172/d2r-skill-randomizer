import type { MutationContext } from './index';

const PHYS_RES_BONUS = 25;
const RES_CAP = 99;

export function applyIronclad(ctx: MutationContext): void {
  const { headers: mh, rows: mr } = ctx.monstats;
  const cols = ['ResDm', 'ResDm(N)', 'ResDm(H)'].map(c => mh.indexOf(c)).filter(i => i !== -1);
  if (cols.length === 0) return;

  for (const row of mr) {
    if (!row[0]) continue;
    for (const idx of cols) {
      const val = parseInt(row[idx], 10);
      const base = isNaN(val) ? 0 : val;
      row[idx] = String(Math.min(RES_CAP, base + PHYS_RES_BONUS));
    }
  }
}
