import type { MutationContext } from './index';
import { EXP_COLS, TC_COL, ACT_RE, BOSS_ACTS } from '../players-scaler';

const XP_MULT = 1 / 2;  // half XP per kill
const PICKS_ADD = 1;
const MAX_PICKS = 6;
const NODROP_MULT = 0.5;      // halve NoDrop → items drop more often
const QUALITY_MULT = 2;        // double Unique/Set/Rare weights
const QUALITY_COLS = ['Unique', 'Set', 'Rare'];

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

  // Treasure class modifications
  const { headers: th, rows: tr } = ctx.treasureclass;
  const picksIdx = th.indexOf('Picks');
  const noDropIdx = th.indexOf('NoDrop');
  const qualityIdxs = QUALITY_COLS.map(c => th.indexOf(c)).filter(i => i !== -1);

  for (const row of tr) {
    // Increase Picks by 1 (capped at MAX_PICKS)
    if (picksIdx !== -1) {
      const picks = parseInt(row[picksIdx], 10);
      if (!isNaN(picks) && picks > 0)
        row[picksIdx] = String(Math.min(MAX_PICKS, picks + PICKS_ADD));
    }

    // Halve NoDrop so items drop more frequently
    if (noDropIdx !== -1) {
      const noDrop = parseInt(row[noDropIdx], 10);
      if (!isNaN(noDrop) && noDrop > 0)
        row[noDropIdx] = String(Math.max(1, Math.round(noDrop * NODROP_MULT)));
    }

    // Double Unique/Set/Rare weights for better quality drops
    for (const idx of qualityIdxs) {
      const val = parseInt(row[idx], 10);
      if (!isNaN(val) && val > 0)
        row[idx] = String(Math.round(val * QUALITY_MULT));
    }
  }
}
