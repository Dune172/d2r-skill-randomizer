// Fixed rollout boundary: never derive this from today's date or rotation slot.
// Challenges 1–14 were published without monster randomization.
export const MONSTER_SHUFFLE_FIRST_CHALLENGE = 15;

export function challengeRandomizesMonsters(weekNumber: number): boolean {
  return Number.isInteger(weekNumber) && weekNumber >= MONSTER_SHUFFLE_FIRST_CHALLENGE;
}
