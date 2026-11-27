/**
 * Addresses of the per-challenge pages (/archive/challenge-9-toil-and-trouble).
 * Pure functions: imported by client components (archive cards) and server pages.
 */
import { getWeekName } from '@/lib/mutations/registry';
import { getCurrentWeekNumber, getWeekEnd } from './week';

/** "Fool's Gold" → "fools-gold". */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** The URL path segment for a challenge. The number keeps it unique: names repeat with the rotation. */
export function challengeSlug(challenge: number): string {
  return `challenge-${challenge}-${slugify(getWeekName(challenge))}`;
}

export function challengePath(challenge: number): string {
  return `/archive/${challengeSlug(challenge)}`;
}

/** The challenge number in a slug, or null. Accepts any name part; the page redirects to the canonical one. */
export function parseChallengeSlug(slug: string): number | null {
  const m = /^challenge-(\d{1,4})(?:-|$)/.exec(slug);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 ? n : null;
}

/** Finished challenges get a page; the running one lives on /challenge. */
export function isPastChallenge(challenge: number, now: Date = new Date()): boolean {
  return Number.isInteger(challenge) && challenge >= 1 && challenge < getCurrentWeekNumber(now);
}

/** Finished challenges, newest first. */
export function pastChallenges(now: Date = new Date()): number[] {
  const current = getCurrentWeekNumber(now);
  return Array.from({ length: Math.max(0, current - 1) }, (_, i) => current - 1 - i);
}

/** The last day of a challenge as YYYY-MM-DD, Pacific time (its "last updated" date). */
export function challengeEndDate(challenge: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(getWeekEnd(challenge));
}
