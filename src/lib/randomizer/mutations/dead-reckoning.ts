import type { MutationContext } from './index';
import { EXP_COLS, TC_COL, ACT_RE, BOSS_ACTS } from '../players-scaler';

const XP_MULT = 1 / 2;  // half XP per kill
const PICKS_ADD = 1;
const MAX_PICKS = 6;

export function applyDeadReckoning(ctx: MutationContext): void {
  // Halve XP given by all monsters in monstats
  const { headers: mh, rows: mr } = ctx.monstats;
  const tcIdx = mh.indexOf(TC_COL);
  const expIdxs = EXP_COLS.map(c => mh.indexOf(c)).filter(i => i !== -1);
  for (const row of mr) {
    const id = row[0];
    if (!id) continue;
    const tc = tcIdx !== -1 ? (row[tcIdx] ?? '') : '';
    if (!ACT_RE.test(tc) && !(id in BOSS_ACTS)) continue;
    for (const idx of expIdxs) {
      const val = parseInt(row[idx], 10);
      if (!isNaN(val) && val > 0)
        row[idx] = String(Math.max(1, Math.round(val * XP_MULT)));
    }
  }

  // Increase TC Picks by 1 on all treasure classes (capped at MAX_PICKS)
  const { headers: th, rows: tr } = ctx.treasureclass;
  const picksIdx = th.indexOf('Picks');
  if (picksIdx === -1) return;
  for (const row of tr) {
    const val = parseInt(row[picksIdx], 10);
    if (!isNaN(val) && val > 0)
      row[picksIdx] = String(Math.min(MAX_PICKS, val + PICKS_ADD));
  }
}
