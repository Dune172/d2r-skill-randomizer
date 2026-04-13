import type { MutationContext } from './index';
import { BOSS_ACTS, ACT_RE, TC_COL } from '../players-scaler';

const HP_MULT = 0.5;

// These match the column names verified in players-scaler.ts
const HP_COLS = ['minHP', 'maxHP', 'MinHP(N)', 'MaxHP(N)', 'MinHP(H)', 'MaxHP(H)'];

// Min/max pairs — max is doubled, then the difference is added to min so the
// range stays the same but the floor is raised (e.g. 10–20 becomes 30–40).
const DMG_PAIRS: [string, string][] = [
  ['A1MinD',    'A1MaxD'   ], ['A2MinD',    'A2MaxD'   ], ['S1MinD',    'S1MaxD'   ],
  ['A1MinD(N)', 'A1MaxD(N)'], ['A2MinD(N)', 'A2MaxD(N)'], ['S1MinD(N)', 'S1MaxD(N)'],
  ['A1MinD(H)', 'A1MaxD(H)'], ['A2MinD(H)', 'A2MaxD(H)'], ['S1MinD(H)', 'S1MaxD(H)'],
  ['El1MinD',   'El1MaxD'  ], ['El2MinD',   'El2MaxD'  ], ['El3MinD',   'El3MaxD'  ],
  ['El1MinD(N)','El1MaxD(N)'], ['El2MinD(N)','El2MaxD(N)'], ['El3MinD(N)','El3MaxD(N)'],
  ['El1MinD(H)','El1MaxD(H)'], ['El2MinD(H)','El2MaxD(H)'], ['El3MinD(H)','El3MaxD(H)'],
];

export function applyGlassCannon(ctx: MutationContext): void {
  const { headers: mh, rows: mr } = ctx.monstats;

  const tcIdx = mh.indexOf(TC_COL);
  const hpIdxs = HP_COLS.map(c => mh.indexOf(c)).filter(i => i !== -1);
  const dmgPairIdxs = DMG_PAIRS.map(([min, max]) => [mh.indexOf(min), mh.indexOf(max)] as [number, number])
    .filter(([minI, maxI]) => minI !== -1 && maxI !== -1);

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
    for (const [minI, maxI] of dmgPairIdxs) {
      const maxVal = parseInt(row[maxI], 10);
      if (isNaN(maxVal) || maxVal <= 0) continue;
      const newMax = maxVal * 2;
      row[maxI] = String(newMax);
      const minVal = parseInt(row[minI], 10);
      if (!isNaN(minVal) && minVal > 0) row[minI] = String(minVal + maxVal);
    }
  }
}
