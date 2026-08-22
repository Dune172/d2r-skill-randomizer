import type { MutationContext } from './index';
import { scaleIntCell } from './util';

/**
 * Court of Kings — the world is run by its elites.
 *
 * MonUMin/MonUMax is a literal COUNT of special (champion/unique) packs spawned
 * in an area, and vanilla is modest: 1–2 almost everywhere, 1–3 in a few Act 5
 * areas. Tripling it puts 3–6 special packs in a typical area while MonDen drops
 * the surrounding trash to ~⅔, so the share of any given field that is elite
 * climbs far more than 3×.
 *
 * SCALE, NEVER SET. A flat "every area gets 4–6" would spawn boss packs into
 * areas the game deliberately keeps clear — Act 1 Wilderness 1, Act 1 Cave 1 and
 * Baal Temple 1 all ship MonUMin/MonUMax = 0, and Act 5 Siege areas ship
 * MonDen = 0 because their spawns are scripted. Multiplying preserves those
 * zeros for free and keeps each area's relative design intact.
 *
 * The cap matters: Act 5 rolls up to 3 specials, which would reach 9 uncapped —
 * enough overlapping aura affixes (Conviction, Might, Fanaticism) to be
 * unsurvivable in Hell.
 */

const UNIQUE_MULT = 3;
const UNIQUE_CAP = 6;
const DENSITY_MULT = 0.65;

const UNIQUE_COLS = [
  'MonUMin',    'MonUMax',
  'MonUMin(N)', 'MonUMax(N)',
  'MonUMin(H)', 'MonUMax(H)',
];

const DENSITY_COLS = ['MonDen', 'MonDen(N)', 'MonDen(H)'];

export function applyCourtOfKings(ctx: MutationContext): void {
  const { headers: lh, rows: lr } = ctx.levels;

  const uniqueIdxs = UNIQUE_COLS.map(c => lh.indexOf(c)).filter(i => i !== -1);
  const densityIdxs = DENSITY_COLS.map(c => lh.indexOf(c)).filter(i => i !== -1);

  for (const row of lr) {
    if (!row[0]) continue;

    for (const idx of uniqueIdxs) {
      const val = parseInt(row[idx], 10);
      // A 0 here is a deliberate "no specials in this area" — leave it alone.
      if (isNaN(val) || val <= 0) continue;
      row[idx] = String(Math.min(UNIQUE_CAP, val * UNIQUE_MULT));
    }

    // scaleIntCell no-ops on blank/zero cells, so scripted MonDen = 0 areas
    // stay at 0.
    for (const idx of densityIdxs) {
      scaleIntCell(row, idx, DENSITY_MULT);
    }
  }
}
