// Type-only: this file reaches the client bundle via ChallengeGenerator.
import type { MonsterSelection } from '@/lib/randomizer/enemy-randomizer';

// Fixed rollout boundary: never derive this from today's date or rotation slot.
// Challenges 1–14 were published without monster randomization.
export const MONSTER_SHUFFLE_FIRST_CHALLENGE = 15;

// Published challenges keep the selection they launched with so their layouts stay stable:
// 15 used the v3 round-robin, 16–17 the v4 rosters.
export const MONSTER_SHUFFLE_V4_FIRST_CHALLENGE = 16;
export const MONSTER_SHUFFLE_V5_FIRST_CHALLENGE = 18;

/** Monster-shuffle selection version for a challenge (callers check challengeRandomizesMonsters first). */
export function challengeMonsterSelection(weekNumber: number): MonsterSelection {
  if (weekNumber < MONSTER_SHUFFLE_V4_FIRST_CHALLENGE) return 3;
  if (weekNumber < MONSTER_SHUFFLE_V5_FIRST_CHALLENGE) return 4;
  return 5; // keep equal to CURRENT_MONSTER_SELECTION (checked by test:enemies)
}

export function challengeRandomizesMonsters(weekNumber: number): boolean {
  return Number.isInteger(weekNumber) && weekNumber >= MONSTER_SHUFFLE_FIRST_CHALLENGE;
}
