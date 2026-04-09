import type { MutationContext } from './index';

const REGEN_MULT = 10;
const REGEN_BASE = 1;

export function applyBloodthirst(ctx: MutationContext): void {
  const { headers: mh, rows: mr } = ctx.monstats;
  const regenIdx = mh.indexOf('DamageRegen');
  if (regenIdx === -1) return;

  for (const row of mr) {
    if (!row[0]) continue;
    const val = parseInt(row[regenIdx], 10);
    const effective = (!isNaN(val) && val > 0) ? val : REGEN_BASE;
    row[regenIdx] = String(effective * REGEN_MULT);
  }
}
