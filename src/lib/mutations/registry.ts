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
      'All skill mana costs are increased to 2.5×. In return, all skills deal 50% increased elemental damage.',
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
      'All weapon strength and dexterity requirements are increased by 50%. Weapons with stat requirements deal twice as much damage. Magic weapon affixes gain chance-to-cast procs drawn from a wide skill pool, existing proc chances are doubled, and proc skill level scales with item level.',
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
  15: {
    id: 'molasses',
    name: 'Molasses',
    emoji: '🐌',
    description:
      'Every monster moves at half speed, and every blow they land hits twice as hard. ' +
      'Your own speed is untouched — there is room to kite, if you can make it count.',
  },
  16: {
    id: 'no-guard',
    name: 'No Guard',
    emoji: '🛡️',
    description:
      'Armor provides no defense at all, and every defense-granting skill has been ' +
      'struck from the skill trees — replaced by something else entirely. Resistances ' +
      'and blocking are all that stand between you and the floor.',
  },
  17: {
    id: 'court-of-kings',
    name: 'Court of Kings',
    emoji: '👑',
    description:
      'Three times as many champion and unique packs roam every area, with a third ' +
      'fewer common monsters between them. Almost everything you meet has a title ' +
      'and an aura to match.',
  },
  18: {
    id: 'band-of-brothers',
    name: 'Band of Brothers',
    emoji: '🤝',
    description:
      'Your hireling is the hero of this run — far tougher, far deadlier, and casting ' +
      'at much higher skill levels. You gain markedly less life per point of vitality, ' +
      'so your place is behind them.',
  },
};

/**
 * Mutation id pairs that must never share a rotation slot.
 *
 * APPLY_FNS runs mutations in sequence with no conflict guard, so two mutations
 * writing the same cells silently resolve as last-write-wins (or compound, for
 * multiplicative scalers). Others conflict at the design level rather than the
 * data level — a mutation that removes weapon drops guts one that makes the
 * hireling the damage dealer.
 *
 * Enforced by assertNoConflictingMutations(), called from applyWeeklyMutations.
 */
export const EXCLUSIVE_MUTATION_PAIRS: ReadonlyArray<readonly [number, number]> = [
  // Molasses halves monster speed, Hyperdrive multiplies it by 1.5 — same columns,
  // opposite intent, and the result depends purely on APPLY_FNS ordering.
  [15, 1],
  // Both scale the monstats damage pairs. Stacked they compound to 4x minimum
  // damage, against Glass Cannon's already-halved monster HP.
  [15, 6],
  // Heavy Burden multiplies armor defense by 1.5; No Guard zeroes it. Whichever
  // runs second wins outright.
  [16, 2],
  // Both scale charstats LifePerVitality (Hollow Shell to 1/3, Band of Brothers
  // to 3/4). Stacked they compound to a quarter of vanilla.
  [18, 3],
  // House Always Wins removes all weapon drops, leaving the hero hireling with
  // nothing to swing.
  [18, 9],
];

/**
 * Throws if the given mutation ids contain a pair that must not run together.
 * Rotation slots are authored by hand, so this is a guard against a bad edit to
 * WEEKLY_MUTATIONS rather than a runtime condition.
 */
export function assertNoConflictingMutations(ids: readonly number[]): void {
  const active = new Set(ids);
  for (const [a, b] of EXCLUSIVE_MUTATION_PAIRS) {
    if (!active.has(a) || !active.has(b)) continue;
    const nameA = MUTATIONS[a]?.name ?? `#${a}`;
    const nameB = MUTATIONS[b]?.name ?? `#${b}`;
    throw new Error(
      `Conflicting mutations in the same slot: "${nameA}" and "${nameB}" ` +
      `cannot run together (see EXCLUSIVE_MUTATION_PAIRS in mutations/registry.ts).`,
    );
  }
}

/**
 * 31-slot rotation schedule. Slot i is used on week (weekNumber % 31).
 * Each entry lists the 2–3 active mutation ids for that slot. Slots 0–6 are the
 * original pairs (past + current challenges, kept intact); slots 7–30 carry a
 * third mutation for future challenges.
 */
export const WEEKLY_MUTATIONS: number[][] = [
  // ── Slots 0-11: already played (challenges 1-12). Frozen — the archive page
  // renders past challenges from these, so editing one rewrites history.
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
  // ── Slots 12+: upcoming. Every slot is validated by scripts/verify-new-mutations.mjs
  // for exclusion-pair conflicts, duplicate combos, and mutation-usage balance.
  [16, 11, 13], // 12
  [18, 17, 10], // 13
  [16, 8, 12],  // 14
  [15, 10, 11], // 15
  [18, 5, 6],   // 16
  [4, 15, 7],   // 17
  [16, 6, 14],  // 18
  [15, 5, 9],   // 19
  [17, 1, 14],  // 20
  [18, 4, 10],  // 21
  [16, 3, 8],   // 22
  [17, 11, 2],  // 23
  [1, 4, 12],   // 24
  [16, 5, 10],  // 25
  [18, 14, 1],  // 26
  [17, 6, 3],   // 27
  [15, 9, 2],   // 28
  [18, 12, 6],  // 29
  [17, 4, 8],   // 30
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
  'All In',              // 12 No Guard + Titan's Grip + Dead Reckoning
  'The Vanguard',        // 13 Band of Brothers + Court of Kings + Tempered Edge
  'Blind Faith',         // 14 No Guard + Arcane Surge + Mystery Box
  'Dead Weight',         // 15 Molasses + Tempered Edge + Titan's Grip
  'Shield Wall',         // 16 Band of Brothers + The Horde + Glass Cannon
  'The Long Rot',        // 17 Bloodthirst + Molasses + Pestilence
  'Ruin',                // 18 No Guard + Glass Cannon + Entropy
  'Slow Fortune',        // 19 Molasses + The Horde + House Always Wins
  'The Warband',         // 20 Court of Kings + Hyperdrive + Entropy
  'Old Guard',           // 21 Band of Brothers + Bloodthirst + Tempered Edge
  'Thin Veil',           // 22 No Guard + Hollow Shell + Arcane Surge
  'Iron Court',          // 23 Court of Kings + Titan's Grip + Heavy Burden
  'Fever Dream',         // 24 Hyperdrive + Bloodthirst + Mystery Box
  'Bare Bones',          // 25 No Guard + The Horde + Tempered Edge
  'Hard March',          // 26 Band of Brothers + Entropy + Hyperdrive
  'Crown of Thorns',     // 27 Court of Kings + Glass Cannon + Hollow Shell
  "Beggar's Iron",       // 28 Molasses + House Always Wins + Heavy Burden
  'Sworn Sword',         // 29 Band of Brothers + Mystery Box + Glass Cannon
  'Royal Blood',         // 30 Court of Kings + Bloodthirst + Arcane Surge
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
