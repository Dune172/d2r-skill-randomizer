/**
 * Player-picked mutations for the Generate page (Random Seed and Class Builder).
 * Pure TypeScript with no Node APIs, so the form, share links, /api/randomize,
 * /api/download and /api/preview all share the same rules.
 *
 * A custom set is always normalized (pickable ids only, deduped, sorted), so equal
 * picks give equal cache keys, share links and save folders. Sorting is safe: the
 * pairs whose result depends on apply order are in EXCLUSIVE_MUTATION_PAIRS and
 * can never be picked together.
 */
import { MUTATIONS, EXCLUSIVE_MUTATION_PAIRS } from './registry';
import { NO_GUARD_EXCLUDED_SKILLS } from './no-guard-skills';

/** Forgotten Arts (19) rewrites skills, items and art, so it stays challenge-only. */
const CHALLENGE_ONLY = new Set([19]);

/** Every mutation a player can pick, in id order. */
export const PICKABLE_MUTATION_IDS: readonly number[] = Object.keys(MUTATIONS)
  .map(Number)
  .filter(id => !CHALLENGE_ONLY.has(id))
  .sort((a, b) => a - b);

const PICKABLE = new Set(PICKABLE_MUTATION_IDS);

/** Ids by slug, for the option rules below. */
const HOUSE_ALWAYS_WINS = 9;
const NO_GUARD = 16;

/** Clean up untrusted input: pickable integer ids only, no duplicates, sorted. */
export function normalizeMutationIds(input: unknown): number[] {
  if (!Array.isArray(input)) return [];
  const ids = input.map(Number).filter(n => Number.isInteger(n) && PICKABLE.has(n));
  return [...new Set(ids)].sort((a, b) => a - b);
}

export const mutationName = (id: number) => MUTATIONS[id]?.name ?? `#${id}`;

/** The picked mutation that can't run alongside `id`, or null. */
export function findMutationConflict(id: number, selected: readonly number[]): number | null {
  for (const [a, b] of EXCLUSIVE_MUTATION_PAIRS) {
    if (a === id && selected.includes(b)) return b;
    if (b === id && selected.includes(a)) return a;
  }
  return null;
}

/** The first pair in `ids` that can't run together, or null. */
export function findConflictingPair(ids: readonly number[]): readonly [number, number] | null {
  for (const [a, b] of EXCLUSIVE_MUTATION_PAIRS) {
    if (ids.includes(a) && ids.includes(b)) return [a, b];
  }
  return null;
}

/** Share-link / download param value: "1.5.7". */
export function encodeMutationParam(ids: readonly number[]): string {
  return normalizeMutationIds([...ids]).join('.');
}

export function parseMutationParam(value: string | null | undefined): number[] {
  return value ? normalizeMutationIds(value.split('.')) : [];
}

/** Suffix for the ZIP cache key; empty with no mutations, so existing keys don't change. */
export function mutationCacheSegment(ids: readonly number[]): string {
  return ids.length ? `:mut-v1:${ids.join('.')}` : '';
}

/** Save folder suffix: mutated characters stay apart from unmutated ones. */
export function mutationSavepathSuffix(ids: readonly number[]): string {
  return ids.length ? `_m${ids.join('-')}` : '';
}

/** Usage-stats keys, one per picked mutation. */
export function mutationFeatureKeys(ids: readonly number[]): string[] {
  if (!ids.length) return [];
  return ['mutations', ...ids.map(id => `mutation:${MUTATIONS[id]?.id ?? id}`)];
}

/** Other generator options that decide whether a mutation can be picked. */
export interface MutationOptionContext {
  /** Open Acts quest-item shuffle is on. */
  openActsShuffle?: boolean;
  /** Skill names the player placed by hand in the Class Builder. */
  buildSkills?: Iterable<string>;
}

/**
 * Why `id` can't be picked with these options, or null.
 *  - House Always Wins turns every weapon base in the treasure classes into gold,
 *    which would also eat quest weapons the Open Acts shuffle hands to monsters.
 *  - No Guard pulls defense skills from the shuffle, but the placer keeps
 *    hand-placed skills, so a build holding one would break the rule.
 */
export function mutationOptionConflict(id: number, ctx: MutationOptionContext): string | null {
  if (id === HOUSE_ALWAYS_WINS && ctx.openActsShuffle) {
    return 'Not available with the Open Acts quest shuffle';
  }
  if (id === NO_GUARD && ctx.buildSkills) {
    for (const name of ctx.buildSkills) {
      if (NO_GUARD_EXCLUDED_SKILLS.has(name)) return `Your build uses ${name}, a defense skill`;
    }
  }
  return null;
}

/** First problem with this set of picks, as a message for the player, or null. */
export function validateMutations(ids: readonly number[], ctx: MutationOptionContext): string | null {
  const pair = findConflictingPair(ids);
  if (pair) return `${mutationName(pair[0])} and ${mutationName(pair[1])} can't be used together.`;
  for (const id of ids) {
    const why = mutationOptionConflict(id, ctx);
    if (why) return `${mutationName(id)}: ${why}.`;
  }
  return null;
}
