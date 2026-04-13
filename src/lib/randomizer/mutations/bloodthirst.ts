import type { MutationContext } from './index';
import { TC_COL, ACT_RE, BOSS_ACTS } from '../players-scaler';

const REGEN_MULT = 10;
const REGEN_BASE = 1;

export function applyBloodthirst(ctx: MutationContext): void {
  const { headers: mh, rows: mr } = ctx.monstats;
  const regenIdx = mh.indexOf('DamageRegen');
  if (regenIdx === -1) return;
  const tcIdx = mh.indexOf(TC_COL);

  for (const row of mr) {
    const id = row[0];
    if (!id) continue;
    const tc = tcIdx !== -1 ? (row[tcIdx] ?? '') : '';
    if (!ACT_RE.test(tc) && !(id in BOSS_ACTS)) continue;
    const val = parseInt(row[regenIdx], 10);
    const effective = (!isNaN(val) && val > 0) ? val : REGEN_BASE;
    row[regenIdx] = String(effective * REGEN_MULT);
  }
}
