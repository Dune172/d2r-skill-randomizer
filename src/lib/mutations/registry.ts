/**
 * Shared mutation registry — pure data, no file I/O.
 * Importable by both client components (WeekData.tsx) and server route handlers.
 */

export interface MutationDef {
  /** Slug used as the image filename: public/mutations/{id}.webp */
  id: string;
  /** Human-readable title shown on the card */
  name: string;
  /** Emoji fallback displayed if the image is missing */
  emoji: string;
  /** Tooltip text shown on hover */
  description: string;
}

export const MUTATIONS: Record<number, MutationDef> = {
  1: {
    id: 'hyperdrive',
    name: 'Hyperdrive',
    emoji: '🏃',
    description:
      'All monsters move and attack faster. Bosses are extra fast. Your run and walk speed is increased by 25%.',
  },
  2: {
    id: 'heavy-burden',
    name: 'Heavy Burden',
    emoji: '🏋️',
    description:
      'All armor strength requirements are increased by 50%. Armor with strength requirements provides 50% more defense.',
  },
  3: {
    id: 'hollow-shell',
    name: 'Hollow Shell',
    emoji: '💧',
    description:
      'Maximum life and mana are reduced by 50%. Mana regenerates significantly faster. You start with the Hollow Locket — a ring that rapidly replenishes both life and mana.',
  },
  4: {
    id: 'bloodthirst',
    name: 'Bloodthirst',
    emoji: '🩸',
    description:
      'All monsters passively regenerate life. Sustain pressure or they will recover before you can finish them.',
  },
  5: {
    id: 'the-horde',
    name: 'The Horde',
    emoji: '💀',
    description:
      'Monster pack sizes are dramatically increased. Nothing spawns alone. Experience gain is reduced by half.',
  },
  6: {
    id: 'glass-cannon',
    name: 'Glass Cannon',
    emoji: '🔴',
    description:
      'Monsters deal twice as much damage but have half as much life.',
  },
  7: {
    id: 'pestilence',
    name: 'Pestilence',
    emoji: '☠️',
    description:
      'All monsters deal poison damage in addition to their normal damage. Antidote potions cost 10× more.',
  },
  8: {
    id: 'arcane-surge',
    name: 'Arcane Surge',
    emoji: '🌊',
    description:
      'All skill mana costs are doubled. In return, all skills deal 50% increased elemental damage.',
  },
  10: {
    id: 'ironclad',
    name: 'Ironclad',
    emoji: '🛡️',
    description:
      'All monsters gain 25% physical resistance. Elemental and skill damage remains unaffected, but raw physical hits deal significantly less damage.',
  },
  11: {
    id: 'titans-grip',
    name: "Titan's Grip",
    emoji: '🌀',
    description:
      'All weapon strength and dexterity requirements are increased by 50%. Weapons with stat requirements deal twice as much damage.',
  },
  13: {
    id: 'dead-reckoning',
    name: 'Dead Reckoning',
    emoji: '🌑',
    description:
      'You gain fewer stat points per level. Monsters drop items more often and at higher quality.',
  },
  14: {
    id: 'entropy',
    name: 'Entropy',
    emoji: '🔩',
    description:
      'All equipment degrades three times as fast and costs ten times as much to repair. Keep your gold and your whetstone ready.',
  },
};

/**
 * 26-week rotation schedule. Entry i is used on week (weekNumber % 26).
 * Each pair is [mutationId, mutationId].
 */
export const WEEKLY_PAIRS: [number, number][] = [
  [5, 7],   // 0
  [8, 13],  // 1
  [1, 6],   // 2
  [2, 10],  // 3
  [4, 5],   // 4
  [7, 13],  // 5
  [3, 5],   // 6
  [8, 11],  // 7
  [2, 13],  // 8
  [7, 4],   // 9
  [3, 13],  // 10
  [14, 7],  // 11
  [8, 13],  // 12
  [1, 5],   // 13
  [4, 13],  // 14
  [3, 6],   // 15
  [1, 13],  // 16
  [2, 5],   // 17
  [6, 13],  // 18
  [4, 14],  // 19
  [6, 7],   // 20
  [1, 3],   // 21
  [2, 7],   // 22
  [3, 6],   // 23
  [5, 11],  // 24
  [2, 10],  // 25
  [11, 13], // 26
  [10, 5],  // 27
  [14, 4],  // 28
  [10, 8],  // 29
  [1, 4],   // 30
];

/**
 * Thematic name for each rotation slot — one per WEEKLY_PAIRS entry.
 * Index matches WEEKLY_PAIRS index (0-based).
 */
export const WEEK_NAMES: string[] = [
  'Swarming Plague',     // 0  The Horde + Pestilence
  'Borrowed Power',      // 1  Arcane Surge + Dead Reckoning
  'Glass Rush',          // 2  Hyperdrive + Glass Cannon
  'Immovable Object',    // 3  Heavy Burden + Ironclad
  'Blood Ocean',         // 4  Bloodthirst + The Horde
  'Slow Death',          // 5  Pestilence + Dead Reckoning
  'Thin Ice',            // 6  Hollow Shell + The Horde
  'Iron Mage',           // 7  Arcane Surge + Titan's Grip
  'Toil and Trouble',    // 8  Heavy Burden + Dead Reckoning
  'Sanguine Plague',     // 9  Pestilence + Bloodthirst
  'Running on Fumes',    // 10 Hollow Shell + Dead Reckoning
  'Rust and Rot',        // 11 Entropy + Pestilence
  'Magical Debt',        // 12 Arcane Surge + Dead Reckoning
  'The Stampede',        // 13 Hyperdrive + The Horde
  'Pyrrhic Victory',     // 14 Bloodthirst + Dead Reckoning
  'Fragile Fury',        // 15 Hollow Shell + Glass Cannon
  'Race to the Bottom',  // 16 Hyperdrive + Dead Reckoning
  'March of the Fallen', // 17 Heavy Burden + The Horde
  'Brittle Fortune',     // 18 Glass Cannon + Dead Reckoning
  'Gnawing Rust',        // 19 Bloodthirst + Entropy
  'Shattered Venom',     // 20 Glass Cannon + Pestilence
  'Fragile Flash',       // 21 Hyperdrive + Hollow Shell
  'Poisoned Chains',     // 22 Heavy Burden + Pestilence
  'Paper Tigers',        // 23 Hollow Shell + Glass Cannon
  'Iron Tide',           // 24 The Horde + Titan's Grip
  'Iron Will',           // 25 Heavy Burden + Ironclad
  'The Long March',      // 26 Titan's Grip + Dead Reckoning
  'Fortress Siege',      // 27 Ironclad + The Horde
  'The Corrosion',       // 28 Entropy + Bloodthirst
  'Spell and Steel',     // 29 Ironclad + Arcane Surge
  'Blood Rush',          // 30 Hyperdrive + Bloodthirst
];

/** Return the two active MutationDefs for the given week number (1-based). */
export function getActivePair(weekNumber: number): [MutationDef, MutationDef] {
  const [a, b] = WEEKLY_PAIRS[(weekNumber - 1) % WEEKLY_PAIRS.length];
  return [MUTATIONS[a], MUTATIONS[b]];
}

/** Return the thematic name for the given week number (1-based). */
export function getWeekName(weekNumber: number): string {
  return WEEK_NAMES[(weekNumber - 1) % WEEK_NAMES.length];
}
