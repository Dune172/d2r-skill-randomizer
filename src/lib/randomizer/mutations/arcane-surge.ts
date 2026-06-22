import type { MutationContext } from './index';

const MANA_MULT = 2.5;
const ELEM_DMG_MULT = 1.5;

const MANA_COLS = ['mana', 'lvlmana'];

// Paired min/max columns: scale max, then set min = newMax - originalDelta
// so the damage range (max - min) stays the same.
const ELEM_PAIRS: [string, string][] = [
  ['EMin', 'EMax'],
  ['EMinLev1', 'EMaxLev1'],
  ['EMinLev2', 'EMaxLev2'],
  ['EMinLev3', 'EMaxLev3'],
  ['EMinLev4', 'EMaxLev4'],
  ['EMinLev5', 'EMaxLev5'],
];

export function applyArcaneSurge(ctx: MutationContext): void {
  const { headers: sh, rows: sr } = ctx.skills;
  const charclassIdx = sh.indexOf('charclass');

  const manaIdxs = MANA_COLS.map(c => sh.indexOf(c)).filter(i => i !== -1);
  const elemPairIdxs = ELEM_PAIRS
    .map(([minCol, maxCol]) => [sh.indexOf(minCol), sh.indexOf(maxCol)] as [number, number])
    .filter(([a, b]) => a !== -1 && b !== -1);

  for (const row of sr) {
    // Only player skills (have a charclass)
    if (charclassIdx !== -1 && !row[charclassIdx]) continue;

    // 2.5× mana cost
    for (const idx of manaIdxs) {
      const val = parseFloat(row[idx]);
      if (!isNaN(val) && val !== 0) row[idx] = String(Math.round(val * MANA_MULT * 100) / 100);
    }

    // Boost elemental damage: scale max, preserve the min-max delta
    for (const [minIdx, maxIdx] of elemPairIdxs) {
      const min = parseInt(row[minIdx], 10);
      const max = parseInt(row[maxIdx], 10);
      if (isNaN(max) || max <= 0) continue;
      const delta = max - (isNaN(min) ? 0 : min);
      const newMax = Math.round(max * ELEM_DMG_MULT);
      const newMin = Math.max(0, newMax - delta);
      row[maxIdx] = String(newMax);
      if (!isNaN(min)) row[minIdx] = String(newMin);
    }
  }
}
