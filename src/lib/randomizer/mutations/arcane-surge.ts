import type { MutationContext } from './index';

const MANA_MULT = 2;
const ELEM_DMG_MULT = 1.3;

const MANA_COLS = ['mana', 'lvlmana'];
const ELEM_COLS = ['EMin', 'EMax', 'EMinLev1', 'EMinLev2', 'EMinLev3', 'EMinLev4', 'EMinLev5',
  'EMaxLev1', 'EMaxLev2', 'EMaxLev3', 'EMaxLev4', 'EMaxLev5'];

export function applyArcaneSurge(ctx: MutationContext): void {
  const { headers: sh, rows: sr } = ctx.skills;
  const charclassIdx = sh.indexOf('charclass');

  const manaIdxs = MANA_COLS.map(c => sh.indexOf(c)).filter(i => i !== -1);
  const elemIdxs = ELEM_COLS.map(c => sh.indexOf(c)).filter(i => i !== -1);

  for (const row of sr) {
    // Only player skills (have a charclass)
    if (charclassIdx !== -1 && !row[charclassIdx]) continue;

    // Double mana cost
    for (const idx of manaIdxs) {
      const val = parseInt(row[idx], 10);
      if (!isNaN(val) && val > 0) row[idx] = String(Math.round(val * MANA_MULT));
    }

    // Boost elemental damage
    for (const idx of elemIdxs) {
      const val = parseInt(row[idx], 10);
      if (!isNaN(val) && val > 0) row[idx] = String(Math.round(val * ELEM_DMG_MULT));
    }
  }
}
