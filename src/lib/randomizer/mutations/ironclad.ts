import type { MutationContext } from './index';
import { TC_COL, ACT_RE, BOSS_ACTS } from '../players-scaler';

const PHYS_RES_BONUS = 25;
const RES_CAP = 99;

export function applyIronclad(ctx: MutationContext): void {
  const { headers: mh, rows: mr } = ctx.monstats;
  const cols = ['ResDm', 'ResDm(N)', 'ResDm(H)'].map(c => mh.indexOf(c)).filter(i => i !== -1);
  if (cols.length === 0) return;
  const tcIdx = mh.indexOf(TC_COL);

  for (const row of mr) {
    const id = row[0];
    if (!id) continue;
    const tc = tcIdx !== -1 ? (row[tcIdx] ?? '') : '';
    if (!ACT_RE.test(tc) && !(id in BOSS_ACTS)) continue;
    for (const idx of cols) {
      const val = parseInt(row[idx], 10);
      const base = isNaN(val) ? 0 : val;
      row[idx] = String(Math.min(RES_CAP, base + PHYS_RES_BONUS));
    }
  }
}
