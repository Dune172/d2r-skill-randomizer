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
      'All monsters move 50% faster. Bosses gain the Extra Fast affix, attacking and closing in quicker still. Your walk and run speed is increased by 30%.',
  },
  2: {
    id: 'heavy-burden',
    name: 'Heavy Burden',
    emoji: '🏋️',
    description:
      'All armor strength requirements are increased by 50%. Armor with strength requirements provides 50% more defense. All magic armor gains a chance to cast a random skill when hit — skill power scales with item level.',
  },
  3: {
    id: 'hollow-shell',
    name: 'Hollow Shell',
    emoji: '💧',
    description:
      'Maximum life and mana are reduced by 50%. Mana regenerates significantly faster. Health and mana potions cost five times as much. You start with the Hollow Locket — a ring that rapidly replenishes both life and mana.',
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
      'Monster pack sizes are dramatically increased. Nothing spawns alone. Experience gain and non-boss enemy damage are both reduced by a third.',
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
  9: {
    id: 'house-always-wins',
    name: 'House Always Wins',
    emoji: '🎰',
    description:
      'Vendors no longer sell weapons or armor, and monsters no longer drop them — every kill spills gold instead, and gold drops are massively increased. Gambling is now the only way to arm yourself.',
  },
  12: {
    id: 'mystery-box',
    name: 'Mystery Box',
    emoji: '🎁',
    description:
      'Every skill in the tree is disguised — all icons look identical and all names ' +
      'and descriptions read "???". You pick blind and find out what you got by using it.',
  },
  10: {
    id: 'tempered-edge',
    name: 'Tempered Edge',
    emoji: '⚔️',
    description:
      'All monsters gain +30 to Cold, Fire, Lightning, and Poison resistance, but lose 40 physical resistance.',
  },
  11: {
    id: 'titans-grip',
    name: "Titan's Grip",
    emoji: '🌀',
    description:
      'All weapon strength and dexterity requirements are increased by 50%. Weapons with stat requirements deal twice as much damage. Proc chances on qualifying weapons are doubled, and proc skill level scales with item level.',
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
      'All equipment degrades four times as fast and costs ten times as much to repair. Keep your gold and your whetstone ready.',
  },
};

/**
 * 31-slot rotation schedule. Slot i is used on week (weekNumber % 31).
 * Each entry lists the 2–3 active mutation ids for that slot. Slots 0–6 are the
 * original pairs (past + current challenges, kept intact); slots 7–30 carry a
 * third mutation for future challenges.
 */
export const WEEKLY_MUTATIONS: number[][] = [
  [5, 7],       // 0
  [8, 13],      // 1
  [1, 6],       // 2
  [2, 10],      // 3
  [4, 5],       // 4
  [7, 13],      // 5
  [3, 5],       // 6
  [8, 11, 9],   // 7
  [2, 13, 12],  // 8
  [9, 3, 14],   // 9
  [3, 13, 8],   // 10
  [14, 7, 2],   // 11
  [9, 13, 12],  // 12
  [1, 5, 6],    // 13
  [4, 13, 6],   // 14
  [3, 6, 1],    // 15
  [1, 13, 5],   // 16
  [2, 5, 10],   // 17
  [6, 13, 14],  // 18
  [4, 14, 7],   // 19
  [6, 7, 1],    // 20
  [1, 3, 6],    // 21
  [2, 7, 14],   // 22
  [9, 5, 12],   // 23
  [5, 11, 2],   // 24
  [2, 10, 11],  // 25
  [11, 13, 2],  // 26
  [10, 5, 11],  // 27
  [14, 4, 10],  // 28
  [10, 8, 11],  // 29
  [1, 4, 6],    // 30
];

/**
 * Thematic name for each rotation slot — one per WEEKLY_MUTATIONS entry.
 * Index matches WEEKLY_MUTATIONS index (0-based).
 */
export const WEEK_NAMES: string[] = [
  'Swarming Plague',     // 0  The Horde + Pestilence
  'Borrowed Power',      // 1  Arcane Surge + Dead Reckoning
  'Glass Rush',          // 2  Hyperdrive + Glass Cannon
  'Immovable Object',    // 3  Heavy Burden + Tempered Edge
  'Blood Ocean',         // 4  Bloodthirst + The Horde
  'Slow Death',          // 5  Pestilence + Dead Reckoning
  'Thin Ice',            // 6  Hollow Shell + The Horde
  'High Stakes',         // 7  Arcane Surge + Titan's Grip + House Always Wins
  'Toil and Trouble',    // 8  Heavy Burden + Dead Reckoning + Mystery Box
  "Fool's Gold",         // 9  House Always Wins + Hollow Shell + Entropy
  'Running on Fumes',    // 10 Hollow Shell + Dead Reckoning + Arcane Surge
  'Rust and Rot',        // 11 Entropy + Pestilence + Heavy Burden
  'Jackpot',             // 12 House Always Wins + Dead Reckoning + Mystery Box
  'The Stampede',        // 13 Hyperdrive + The Horde + Glass Cannon
  'Pyrrhic Victory',     // 14 Bloodthirst + Dead Reckoning + Glass Cannon
  'Fragile Fury',        // 15 Hollow Shell + Glass Cannon + Hyperdrive
  'Race to the Bottom',  // 16 Hyperdrive + Dead Reckoning + The Horde
  'March of the Fallen', // 17 Heavy Burden + The Horde + Tempered Edge
  'Brittle Fortune',     // 18 Glass Cannon + Dead Reckoning + Entropy
  'Gnawing Rust',        // 19 Bloodthirst + Entropy + Pestilence
  'Shattered Venom',     // 20 Glass Cannon + Pestilence + Hyperdrive
  'Fragile Flash',       // 21 Hyperdrive + Hollow Shell + Glass Cannon
  'Poisoned Chains',     // 22 Heavy Burden + Pestilence + Entropy
  'Penny Slots',         // 23 House Always Wins + The Horde + Mystery Box
  'Iron Tide',           // 24 The Horde + Titan's Grip + Heavy Burden
  'Iron Will',           // 25 Heavy Burden + Tempered Edge + Titan's Grip
  'The Long March',      // 26 Titan's Grip + Dead Reckoning + Heavy Burden
  'Fortress Siege',      // 27 Tempered Edge + The Horde + Titan's Grip
  'The Corrosion',       // 28 Entropy + Bloodthirst + Tempered Edge
  'Spell and Steel',     // 29 Tempered Edge + Arcane Surge + Titan's Grip
  'Blood Rush',          // 30 Hyperdrive + Bloodthirst + Glass Cannon
];

/** Return the active MutationDefs for the given week number (1-based); 2 or 3. */
export function getActiveMutations(weekNumber: number): MutationDef[] {
  const ids = WEEKLY_MUTATIONS[(weekNumber - 1) % WEEKLY_MUTATIONS.length];
  return ids.map((id) => MUTATIONS[id]);
}

/** Return the thematic name for the given week number (1-based). */
export function getWeekName(weekNumber: number): string {
  return WEEK_NAMES[(weekNumber - 1) % WEEK_NAMES.length];
}
