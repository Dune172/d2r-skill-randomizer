import type { MutationContext } from './index';
import { EXP_COLS, TC_COL, ACT_RE, BOSS_ACTS } from '../players-scaler';

const XP_MULT = 1 / 2;  // half XP per kill
const NODROP_MULT = 0.5;      // halve NoDrop → items drop more often
const QUALITY_VAL = 1200;      // override Unique/Set/Rare weights (vanilla: 800)
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
  const noDropIdx = th.indexOf('NoDrop');
  const qualityIdxs = QUALITY_COLS.map(c => th.indexOf(c)).filter(i => i !== -1);

  for (const row of tr) {
    // Halve NoDrop so items drop more frequently
    if (noDropIdx !== -1) {
      const noDrop = parseInt(row[noDropIdx], 10);
      if (!isNaN(noDrop) && noDrop > 0)
        row[noDropIdx] = String(Math.max(1, Math.round(noDrop * NODROP_MULT)));
    }

    // Set Unique/Set/Rare weights to 1200 (vanilla: 800)
    for (const idx of qualityIdxs) {
      const val = parseInt(row[idx], 10);
      if (!isNaN(val) && val > 0)
        row[idx] = String(QUALITY_VAL);
    }
  }
}
