/**
 * Item randomization (Generate page and Class Builder option): reroll the properties of
 * unique items, set items, set bonuses and runewords. The step itself is
 * src/lib/randomizer/item-randomizer.ts.
 *
 * Off (0) adds nothing to any request, share link or cache key, so every existing mod
 * stays byte-for-byte the same. Challenges and Forgotten Arts never use it.
 *
 * Browser-safe: the forms and routes share these.
 */

/** 0 = vanilla items, 1 = about half of each item's lines rerolled, 2 = every line. */
export type ItemRandoLevel = 0 | 1 | 2;

export const ITEM_RANDO_LEVELS: readonly ItemRandoLevel[] = [0, 1, 2];

export const ITEM_RANDO_LABELS: Record<ItemRandoLevel, string> = {
  0: 'Vanilla',
  1: 'Partly random',
  2: 'Fully random',
};

/** Clamp anything (body field, query param) to 0, 1 or 2; junk is 0. */
export function normalizeItemRando(value: unknown): ItemRandoLevel {
  const n = Math.trunc(Number(value));
  return n === 1 || n === 2 ? n : 0;
}

/** Inverse of itemRandoParam: an absent param is vanilla. */
export const parseItemRando = (param: string | null): ItemRandoLevel =>
  param === null ? 0 : normalizeItemRando(param);

/** "items=N" when on, else nothing (share links, downloads). */
export const itemRandoParam = (level: ItemRandoLevel): string =>
  level ? `items=${level}` : '';

/** Cache-key segment: empty when off so every existing key is unchanged. */
export const itemRandoCacheSegment = (level: ItemRandoLevel): string =>
  level ? `:items${level}-v1` : '';

/** Feature-usage keys (src/lib/feature-stats.ts). */
export const itemRandoFeatureKeys = (level: ItemRandoLevel): string[] =>
  level ? [`items:${level}`] : [];
