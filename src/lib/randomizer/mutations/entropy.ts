import type { MutationContext } from './index';

const DUR_MULT = 1 / 3;
const COST_MULT = 10;

export function applyEntropy(ctx: MutationContext): void {
  for (const table of [ctx.armor, ctx.weapons]) {
    const { headers, rows } = table;
    const durIdx = headers.indexOf('durability');
    const noDurIdx = headers.indexOf('nodurability');
    const costIdx = headers.indexOf('cost');
    if (durIdx === -1) continue;

    for (const row of rows) {
      if (!row[0]) continue;

      if (noDurIdx !== -1 && row[noDurIdx] === '1') continue;
      const dur = parseInt(row[durIdx], 10);
      if (!isNaN(dur) && dur > 0) row[durIdx] = String(Math.max(1, Math.floor(dur * DUR_MULT)));

      if (costIdx !== -1) {
        const cost = parseInt(row[costIdx], 10);
        if (!isNaN(cost) && cost > 0) row[costIdx] = String(Math.round(cost * COST_MULT));
      }
    }
  }
}
