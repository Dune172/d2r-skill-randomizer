import type { MutationContext } from './index';

const DUR_MULT = 0.5;

export function applyEntropy(ctx: MutationContext): void {
  for (const table of [ctx.armor, ctx.weapons]) {
    const { headers, rows } = table;
    const durIdx = headers.indexOf('durability');
    const noDurIdx = headers.indexOf('nodurability');
    if (durIdx === -1) continue;

    for (const row of rows) {
      if (!row[0]) continue;
      if (noDurIdx !== -1 && row[noDurIdx] === '1') continue;
      const val = parseInt(row[durIdx], 10);
      if (!isNaN(val) && val > 0) row[durIdx] = String(Math.max(1, Math.floor(val * DUR_MULT)));
    }
  }
}
