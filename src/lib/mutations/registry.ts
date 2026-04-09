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
      'Strength requirements on all armor are increased by 25%. Dexterity requirements on all weapons are increased by 25%.',
  },
  3: {
    id: 'hollow-shell',
    name: 'Hollow Shell',
    emoji: '💧',
    description:
      'Maximum life and mana are reduced by 40%. Life and mana regeneration are significantly increased.',
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
      'Monster pack sizes are dramatically increased. Nothing spawns alone.',
  },
  6: {
    id: 'glass-cannon',
    name: 'Glass Cannon',
    emoji: '🔴',
    description:
      'Monsters deal 50% more damage but have 40% less life.',
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
      'All skill mana costs are doubled. In return, all skills deal 30% increased elemental damage.',
  },
  9: {
    id: 'cursed-ground',
    name: 'Cursed Ground',
    emoji: '👹',
    description:
      'All monsters spawn already cursed with Amplify Damage.',
  },
  10: {
    id: 'ironclad',
    name: 'Ironclad',
    emoji: '🛡️',
    description:
      'All monsters have triple the defense. Physical attackers will struggle to land hits without serious investment in attack rating.',
  },
  11: {
    id: 'titans-grip',
    name: "Titan's Grip",
    emoji: '🌀',
    description:
      'All weapon strength and dexterity requirements are increased by 50%. All weapon damage is increased by 30%.',
  },
  12: {
    id: 'scavengers-world',
    name: "Scavenger's World",
    emoji: '🏚️',
    description:
      'Item quality is universally downgraded — fewer rares and uniques, more magic and normal items drop.',
  },
  13: {
    id: 'dead-reckoning',
    name: 'Dead Reckoning',
    emoji: '🌑',
    description:
      'Experience gain is reduced by 50%. Monsters drop significantly more gold and have increased treasure class picks.',
  },
  14: {
    id: 'entropy',
    name: 'Entropy',
    emoji: '🔩',
    description:
      'All equipment degrades twice as fast — durability on every weapon and piece of armor is halved. Keep your gold and your whetstone ready.',
  },
};

/**
 * 26-week rotation schedule. Entry i is used on week (weekNumber % 26).
 * Each pair is [mutationId, mutationId].
 */
export const WEEKLY_PAIRS: [number, number][] = [
  [10, 14], // 0
  [2, 5],   // 1
  [3, 6],   // 2
  [7, 9],   // 3
  [8, 12],  // 4
  [11, 13], // 5
  [1, 6],   // 6
  [2, 9],   // 7
  [3, 5],   // 8
  [4, 5],   // 9
  [7, 13],  // 10
  [8, 11],  // 11
  [1, 5],   // 12
  [2, 13],  // 13
  [3, 9],   // 14
  [4, 12],  // 15
  [6, 7],   // 16
  [8, 13],  // 17
  [1, 13],  // 18
  [2, 7],   // 19
  [3, 12],  // 20
  [4, 9],   // 21
  [5, 11],  // 22
  [6, 13],  // 23
  [1, 9],   // 24
  [2, 12],  // 25
  [10, 5],  // 26
  [14, 7],  // 27
  [10, 8],  // 28
  [14, 4],  // 29
  [1, 4],   // 30
];

/** Return the two active MutationDefs for the given week number (1-based). */
export function getActivePair(weekNumber: number): [MutationDef, MutationDef] {
  const [a, b] = WEEKLY_PAIRS[(weekNumber - 1) % WEEKLY_PAIRS.length];
  return [MUTATIONS[a], MUTATIONS[b]];
}
