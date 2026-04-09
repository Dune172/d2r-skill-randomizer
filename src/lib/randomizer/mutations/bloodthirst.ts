import type { MutationContext } from './index';

const REGEN_MULT = 10;

export function applyBloodthirst(ctx: MutationContext): void {
  const { headers: mh, rows: mr } = ctx.monstats;
  const regenIdx = mh.indexOf('DamageRegen');
  if (regenIdx === -1) return;

  for (const row of mr) {
    if (!row[0]) continue;
    const val = parseInt(row[regenIdx], 10);
    if (!isNaN(val) && val > 0) row[regenIdx] = String(val * REGEN_MULT);
  }
}
