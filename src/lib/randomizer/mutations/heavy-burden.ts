import type { MutationContext } from './index';

const ARMOR_MULT = 1.25;
const WEAPON_MULT = 1.25;

export function applyHeavyBurden(ctx: MutationContext): void {
  // Armor: reqstr × 1.25
  const { headers: ah, rows: ar } = ctx.armor;
  const reqstrIdx = ah.indexOf('reqstr');
  if (reqstrIdx !== -1) {
    for (const row of ar) {
      const val = parseInt(row[reqstrIdx], 10);
      if (!isNaN(val) && val > 0) row[reqstrIdx] = String(Math.ceil(val * ARMOR_MULT));
    }
  }

  // Weapons: reqdex × 1.25
  const { headers: wh, rows: wr } = ctx.weapons;
  const reqdexIdx = wh.indexOf('reqdex');
  if (reqdexIdx !== -1) {
    for (const row of wr) {
      const val = parseInt(row[reqdexIdx], 10);
      if (!isNaN(val) && val > 0) row[reqdexIdx] = String(Math.ceil(val * WEAPON_MULT));
    }
  }
}
