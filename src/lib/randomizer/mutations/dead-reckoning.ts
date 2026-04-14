import type { MutationContext } from './index';

const STAT_PER_LEVEL = 3;      // vanilla: 5
const NODROP_MULT = 0.5;       // halve NoDrop → items drop more often
const QUALITY_VAL = 1200;      // override Unique/Set/Rare weights (vanilla: 800)
const QUALITY_COLS = ['Unique', 'Set', 'Rare'];

export function applyDeadReckoning(ctx: MutationContext): void {
  // Reduce stat points per level (vanilla 5 → 3)
  const { headers: ch, rows: cr } = ctx.charstats;
  const statIdx = ch.indexOf('StatPerLevel');
  if (statIdx !== -1) {
    for (const row of cr) {
      const val = parseInt(row[statIdx], 10);
      if (!isNaN(val) && val > 0)
        row[statIdx] = String(STAT_PER_LEVEL);
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
