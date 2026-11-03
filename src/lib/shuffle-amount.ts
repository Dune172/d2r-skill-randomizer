/**
 * Shuffle amount (Generate page option): how much of each class's tree is shuffled.
 *
 * 100 is the normal full shuffle. At 50 or 25 every class keeps its own three tree
 * pages, and only that share of each class's movable skills goes into the shared
 * pool; the rest stay in their vanilla slots. Skills that never move (the pinned
 * ones) count as staying. The default (100) adds nothing to any request, share link
 * or cache key and draws no extra RNG, so every existing seed is byte-for-byte the same.
 *
 * Browser-safe: the forms and routes share these.
 */
export const SHUFFLE_AMOUNTS = [100, 50, 25] as const;
export type ShuffleAmount = (typeof SHUFFLE_AMOUNTS)[number];

/** Anything that isn't exactly 50 or 25 is a full shuffle. */
export function normalizeShuffleAmount(value: unknown): ShuffleAmount {
  const n = Number(value);
  return n === 50 || n === 25 ? n : 100;
}

/** Inverse of shuffleAmountParam: an absent param is a full shuffle. */
export const parseShuffleAmount = (param: string | null): ShuffleAmount =>
  param === null ? 100 : normalizeShuffleAmount(param);

/** "shuffle=N" below 100, else nothing (share links, downloads). */
export const shuffleAmountParam = (n: number): string =>
  n < 100 ? `shuffle=${n}` : '';

/** Cache-key segment: empty at 100 so every existing key is unchanged. */
export const shuffleAmountCacheSegment = (n: number): string =>
  n < 100 ? `:shuf${n}` : '';

/** The share of movable skills that leave their class, for placeSkills; undefined at 100. */
export const shuffleShareOf = (n: number): number | undefined =>
  n < 100 ? n / 100 : undefined;
