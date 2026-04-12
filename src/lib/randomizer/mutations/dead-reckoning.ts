import type { MutationContext } from './index';

const XP_MULT = 2;       // double thresholds = half XP rate
const PICKS_ADD = 1;
const MAX_PICKS = 6;

// Columns to skip in experience.txt (non-numeric)
const SKIP_COLS = new Set(['Level', 'ExpRatio']);

export function applyDeadReckoning(ctx: MutationContext): void {
  // Double XP thresholds in experience.txt
  const { headers: eh, rows: er } = ctx.experience;
  const levelIdx = eh.indexOf('Level');
  for (const row of er) {
    // Skip non-threshold rows (e.g. MaxLvl) — modifying them corrupts the level cap
    if (levelIdx !== -1 && isNaN(parseInt(row[levelIdx], 10))) continue;
    for (let i = 0; i < eh.length; i++) {
      if (SKIP_COLS.has(eh[i])) continue;
      const val = parseInt(row[i], 10);
      if (!isNaN(val) && val > 0) row[i] = String(val * XP_MULT);
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
