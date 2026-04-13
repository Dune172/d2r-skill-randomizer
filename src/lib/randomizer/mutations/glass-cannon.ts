import type { MutationContext } from './index';
import { BOSS_ACTS, ACT_RE, TC_COL } from '../players-scaler';

const HP_MULT = 0.5;
const DMG_MULT = 2.0;

// These match the column names verified in players-scaler.ts
const HP_COLS = ['minHP', 'maxHP', 'MinHP(N)', 'MaxHP(N)', 'MinHP(H)', 'MaxHP(H)'];
const DMG_COLS = [
  'A1MinD', 'A1MaxD', 'A2MinD', 'A2MaxD', 'S1MinD', 'S1MaxD',
  'A1MinD(N)', 'A1MaxD(N)', 'A2MinD(N)', 'A2MaxD(N)', 'S1MinD(N)', 'S1MaxD(N)',
  'A1MinD(H)', 'A1MaxD(H)', 'A2MinD(H)', 'A2MaxD(H)', 'S1MinD(H)', 'S1MaxD(H)',
  'El1MinD', 'El1MaxD', 'El2MinD', 'El2MaxD', 'El3MinD', 'El3MaxD',
  'El1MinD(N)', 'El1MaxD(N)', 'El2MinD(N)', 'El2MaxD(N)', 'El3MinD(N)', 'El3MaxD(N)',
  'El1MinD(H)', 'El1MaxD(H)', 'El2MinD(H)', 'El2MaxD(H)', 'El3MinD(H)', 'El3MaxD(H)',
];

export function applyGlassCannon(ctx: MutationContext): void {
  const { headers: mh, rows: mr } = ctx.monstats;

  const tcIdx = mh.indexOf(TC_COL);
  const hpIdxs = HP_COLS.map(c => mh.indexOf(c)).filter(i => i !== -1);
  const dmgIdxs = DMG_COLS.map(c => mh.indexOf(c)).filter(i => i !== -1);

  for (const row of mr) {
    const id = row[0];
    if (!id) continue;

    // Skip player summons, traps, and map objects — same guard used by players-scaler
    const tc = tcIdx !== -1 ? (row[tcIdx] ?? '') : '';
    const isEnemy = ACT_RE.test(tc) || id in BOSS_ACTS;
    if (!isEnemy) continue;

    for (const idx of hpIdxs) {
      const val = parseInt(row[idx], 10);
      if (!isNaN(val) && val > 0) row[idx] = String(Math.round(val * HP_MULT));
    }
    for (const idx of dmgIdxs) {
      const val = parseInt(row[idx], 10);
      if (!isNaN(val) && val > 0) row[idx] = String(Math.round(val * DMG_MULT));
    }
  }
}
