/**
 * Shared mutation registry — pure data, no file I/O.
 * Importable by both client components (WeekData.tsx) and server route handlers.
 */

export interface MutationDef {
  /** Slug used as the image filename: public/mutations/{id}.png */
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
      'Monster pack sizes are dramatically increased. Nothing spawns alone. Experience gain is reduced to 3/4 of normal.',
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
      'All monsters deal poison damage in addition to their normal damage. Antidote potions no longer spawn.',
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
  [2, 13],  // 0
  [2, 5],   // 1
  [3, 6],   // 2
  [7, 4],   // 3
  [8, 13],  // 4
  [11, 13], // 5
  [1, 6],   // 6
  [2, 10],  // 7
  [3, 5],   // 8
  [4, 5],   // 9
  [7, 13],  // 10
  [8, 11],  // 11
  [1, 5],   // 12
  [2, 13],  // 13
  [3, 13],  // 14
  [4, 14],  // 15
  [6, 7],   // 16
  [8, 13],  // 17
  [1, 13],  // 18
  [2, 7],   // 19
  [3, 6],   // 20
  [4, 13],  // 21
  [5, 11],  // 22
  [6, 13],  // 23
  [1, 3],   // 24
  [2, 10],  // 25
  [10, 5],  // 26
  [14, 7],  // 27
  [10, 8],  // 28
  [14, 4],  // 29
  [1, 4],   // 30
];

/**
 * Thematic name for each rotation slot — one per WEEKLY_PAIRS entry.
 * Index matches WEEKLY_PAIRS index (0-based).
 */
export const WEEK_NAMES: string[] = [
  'Toil and Trouble',    // 0  Heavy Burden + Dead Reckoning
  'March of the Fallen', // 1  Heavy Burden + The Horde
  'Fragile Fury',        // 2  Hollow Shell + Glass Cannon
  'Sanguine Plague',     // 3  Pestilence + Bloodthirst
  'Borrowed Power',      // 4  Arcane Surge + Dead Reckoning
  'The Long March',      // 5  Titan's Grip + Dead Reckoning
  'Glass Rush',          // 6  Hyperdrive + Glass Cannon
  'Immovable Object',    // 7  Heavy Burden + Ironclad
  'Thin Ice',            // 8  Hollow Shell + The Horde
  'Blood Ocean',         // 9  Bloodthirst + The Horde
  'Slow Death',          // 10 Pestilence + Dead Reckoning
  'Iron Mage',           // 11 Arcane Surge + Titan's Grip
  'The Stampede',        // 12 Hyperdrive + The Horde
  'Toil and Trouble',    // 13 Heavy Burden + Dead Reckoning
  'Running on Fumes',    // 14 Hollow Shell + Dead Reckoning
  'Gnawing Rust',        // 15 Bloodthirst + Entropy
  'Shattered Venom',     // 16 Glass Cannon + Pestilence
  'Magical Debt',        // 17 Arcane Surge + Dead Reckoning
  'Race to the Bottom',  // 18 Hyperdrive + Dead Reckoning
  'Poisoned Chains',     // 19 Heavy Burden + Pestilence
  'Paper Tigers',        // 20 Hollow Shell + Glass Cannon
  'Pyrrhic Victory',     // 21 Bloodthirst + Dead Reckoning
  'Iron Tide',           // 22 The Horde + Titan's Grip
  'Brittle Fortune',     // 23 Glass Cannon + Dead Reckoning
  'Fragile Flash',       // 24 Hyperdrive + Hollow Shell
  'Iron Will',           // 25 Heavy Burden + Ironclad
  'Fortress Siege',      // 26 Ironclad + The Horde
  'Rust and Rot',        // 27 Entropy + Pestilence
  'Spell and Steel',     // 28 Ironclad + Arcane Surge
  'The Corrosion',       // 29 Entropy + Bloodthirst
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
