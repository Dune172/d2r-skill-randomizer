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
