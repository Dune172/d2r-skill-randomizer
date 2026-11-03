/**
 * Skill points per level (Generate page and Class Builder option).
 *
 * Vanilla grants 1. The option writes charstats.txt SkillsPerLevel for every class and
 * nothing else: quest rewards, skill levels and the RNG are untouched, so a seed keeps
 * its exact trees whatever the setting. The default (1) adds nothing to any request,
 * share link or cache key, so every existing mod stays byte-for-byte the same.
 *
 * Browser-safe: the forms and routes share these.
 */
export const MAX_SKILL_POINTS = 3;

/** Clamp anything (body field, query param) to a whole number 1–3; junk is 1. */
export function normalizeSkillPoints(value: unknown): number {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) ? Math.min(MAX_SKILL_POINTS, Math.max(1, n)) : 1;
}

/** Inverse of skillPointsParam: an absent param is vanilla. */
export const parseSkillPoints = (param: string | null): number =>
  param === null ? 1 : normalizeSkillPoints(param);

/** "&skillPoints=N" for N > 1, else nothing (share links, downloads). */
export const skillPointsParam = (n: number): string =>
  n > 1 ? `skillPoints=${n}` : '';

/** Cache-key segment: empty at 1 so every existing key is unchanged. */
export const skillPointsCacheSegment = (n: number): string =>
  n > 1 ? `:spl${n}` : '';

/** Set SkillsPerLevel on every class row (skips the Expansion separator). */
export function applySkillPoints(headers: string[], rows: string[][], n: number): void {
  if (n <= 1) return;
  const col = headers.indexOf('SkillsPerLevel');
  if (col === -1) throw new Error('charstats.txt has no SkillsPerLevel column');
  for (const row of rows) {
    if (!row[0] || row[0] === 'Expansion') continue;
    row[col] = String(n);
  }
}
