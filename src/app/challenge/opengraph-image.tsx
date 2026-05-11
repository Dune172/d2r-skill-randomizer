import { getCurrentWeekNumber } from '@/lib/challenge/week';
import {
  buildChallengeCardImageResponse,
  OG_SIZE,
  OG_CONTENT_TYPE,
} from '@/lib/og/challengeCard';

export const revalidate = 3600;
export const alt = 'D2R Randomizer — Weekly Challenge Seed';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image() {
  return buildChallengeCardImageResponse(getCurrentWeekNumber());
}
