// Mirrors the order/names in src/lib/randomizer/config.ts CLASS_DEFS, but kept
// in a tiny standalone module so client components can import it without
// pulling in the randomizer's server-only types.
export const CLASS_NAMES = [
  'Amazon',
  'Sorceress',
  'Necromancer',
  'Paladin',
  'Barbarian',
  'Druid',
  'Assassin',
  'Warlock',
] as const;

export type ClassName = (typeof CLASS_NAMES)[number];

export function isClassName(s: unknown): s is ClassName {
  return typeof s === 'string' && (CLASS_NAMES as readonly string[]).includes(s);
}

// Race Mode picks one class to be the single playable (randomized) class, derived
// purely from the seed so everyone racing the same seed plays the same class. All 8
// classes (including Warlock) are eligible. This does NOT consume the generation RNG,
// so the chosen class's normal shuffle stays reproducible. Kept here (client-safe) so
// the generate page can announce the class; the server maps the same index to a
// ClassCode via CLASS_DEFS (same order — see note above).
export function pickRaceClassIndex(seed: number): number {
  return (seed >>> 0) % CLASS_NAMES.length;
}

export function pickRaceClassName(seed: number): ClassName {
  return CLASS_NAMES[pickRaceClassIndex(seed)];
}
