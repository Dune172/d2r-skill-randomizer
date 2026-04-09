import type { MutationContext } from './index';

const REGEN_VALUE = '80'; // DamageRegen default is ~2; 80 gives rapid visible regen

export function applyBloodthirst(ctx: MutationContext): void {
  const { headers: mh, rows: mr } = ctx.monstats;
  const regenIdx = mh.indexOf('DamageRegen');
  if (regenIdx === -1) return;

  for (const row of mr) {
    if (!row[0]) continue;
    row[regenIdx] = REGEN_VALUE;
  }
}
