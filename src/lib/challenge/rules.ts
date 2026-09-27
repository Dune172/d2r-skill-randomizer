// Fixed rollout boundary: never derive this from today's date or rotation slot.
// Challenges 1–14 were published without monster randomization.
export const MONSTER_SHUFFLE_FIRST_CHALLENGE = 15;

// Challenges before this keep the v3 round-robin selection so published layouts stay stable.
export const MONSTER_SHUFFLE_V4_FIRST_CHALLENGE = 16;

export function challengeUsesLegacyMonsterSelection(weekNumber: number): boolean {
  return challengeRandomizesMonsters(weekNumber) && weekNumber < MONSTER_SHUFFLE_V4_FIRST_CHALLENGE;
}

export function challengeRandomizesMonsters(weekNumber: number): boolean {
  return Number.isInteger(weekNumber) && weekNumber >= MONSTER_SHUFFLE_FIRST_CHALLENGE;
}
