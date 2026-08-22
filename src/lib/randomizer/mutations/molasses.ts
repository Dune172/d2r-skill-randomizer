import type { MutationContext } from './index';
import { BOSS_ACTS, ACT_RE, TC_COL } from '../players-scaler';

/**
 * Molasses — the world crawls, but every blow lands like a truck.
 *
 * SPEED
 * Velocity/Run are small integers (1–30, clustered 3–10), not rates, so halving
 * has coarse resolution: the 56 monsters at Velocity ≤2 (zombies and kin) floor
 * at 1 and barely change. That is fine — they already crawl. The mutation's felt
 * effect comes from the 5–15 band, where threatening monsters live and where
 * halving lands cleanly (12→6, 15→8).
 *
 * The player is deliberately NOT slowed. Slowing both sides only adds travel
 * time to a mode that is ranked on completion time.
 *
 * DAMAGE
 * ×2, not ×3. Slowing movement does not reduce how often a monster already in
 * melee range connects, so melee builds eat the full multiplier at full rate.
 * Glass Cannon uses ×2 and pays for it by halving HP; Molasses keeps HP intact,
 * so ×3 would land strictly harder than Glass Cannon in Hell.
 *
 * Kiting is strong this week by construction — ranged and caster builds gain the
 * most. That is the mutation's identity, not a bug to balance away.
 */

const SPEED_MULT = 0.5;
const SPEED_FLOOR = 1;   // Velocity 0 would freeze a monster in place entirely
const DMG_MULT = 2;

const SPEED_COLS = ['Velocity', 'Run'];

// Min/max pairs — min is scaled, then the original spread is re-added to max so
// the damage range keeps its shape instead of collapsing. Same approach as
// glass-cannon.ts.
const DMG_PAIRS: [string, string][] = [
  ['A1MinD',    'A1MaxD'   ], ['A2MinD',    'A2MaxD'   ], ['S1MinD',    'S1MaxD'   ],
  ['A1MinD(N)', 'A1MaxD(N)'], ['A2MinD(N)', 'A2MaxD(N)'], ['S1MinD(N)', 'S1MaxD(N)'],
  ['A1MinD(H)', 'A1MaxD(H)'], ['A2MinD(H)', 'A2MaxD(H)'], ['S1MinD(H)', 'S1MaxD(H)'],
  ['El1MinD',   'El1MaxD'  ], ['El2MinD',   'El2MaxD'  ], ['El3MinD',   'El3MaxD'  ],
  ['El1MinD(N)','El1MaxD(N)'], ['El2MinD(N)','El2MaxD(N)'], ['El3MinD(N)','El3MaxD(N)'],
  ['El1MinD(H)','El1MaxD(H)'], ['El2MinD(H)','El2MaxD(H)'], ['El3MinD(H)','El3MaxD(H)'],
];

export function applyMolasses(ctx: MutationContext): void {
  const { headers: mh, rows: mr } = ctx.monstats;

  const tcIdx = mh.indexOf(TC_COL);
  const speedIdxs = SPEED_COLS.map(c => mh.indexOf(c)).filter(i => i !== -1);
  const dmgPairIdxs = DMG_PAIRS.map(([min, max]) => [mh.indexOf(min), mh.indexOf(max)] as [number, number])
    .filter(([minI, maxI]) => minI !== -1 && maxI !== -1);

  for (const row of mr) {
    const id = row[0];
    if (!id) continue;

    // Skip player summons, traps, and map objects — same guard as players-scaler.
    const tc = tcIdx !== -1 ? (row[tcIdx] ?? '') : '';
    const isEnemy = ACT_RE.test(tc) || id in BOSS_ACTS;
    if (!isEnemy) continue;

    for (const idx of speedIdxs) {
      const val = parseInt(row[idx], 10);
      if (isNaN(val) || val <= 0) continue;
      row[idx] = String(Math.max(SPEED_FLOOR, Math.round(val * SPEED_MULT)));
    }

    for (const [minI, maxI] of dmgPairIdxs) {
      const minVal = parseInt(row[minI], 10);
      const maxVal = parseInt(row[maxI], 10);
      if (isNaN(minVal) || isNaN(maxVal) || minVal <= 0 || maxVal <= 0) continue;
      const spread = maxVal - minVal;
      const newMin = Math.round(minVal * DMG_MULT);
      row[minI] = String(newMin);
      row[maxI] = String(newMin + spread);
    }
  }
}
