/**
 * Mutation challenge calendar — anchored to midnight in the America/Los_Angeles
 * timezone. From October 2026 onward, challenges start on the first of each
 * month. Earlier challenge IDs, starts and seeds remain stable for the archive.
 * Challenge 15 ends September 30 to meet the new monthly boundary.
 *
 * Imported by both client and server code (browser, Node, Edge runtime), so
 * it relies only on Intl.DateTimeFormat which is available in all targets.
 */

const TZ = 'America/Los_Angeles';

// Week 1 starts at midnight LA on this date.
// Set to March 9 so that Challenge 6 starts on May 18, 2026.
const BASE_YEAR = 2026;
const BASE_MONTH_ZERO = 2; // March (0-based)
const BASE_DAY = 9;

const APPROX_WEEK_MS = 14 * 24 * 60 * 60 * 1000;
export const FIRST_MONTHLY_CHALLENGE = 16;
export const OCTOBER_2026_CHALLENGE = FIRST_MONTHLY_CHALLENGE;

/**
 * Returns the LA timezone's UTC offset, in milliseconds, for the given moment.
 * Negative for west of UTC: -25,200,000 (-7h) during PDT, -28,800,000 (-8h) during PST.
 */
function laOffsetMs(at: Date): number {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(at).reduce((acc, p) => {
    acc[p.type] = p.value;
    return acc;
  }, {} as Record<string, string>);

  const laAsUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) === 24 ? 0 : Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return laAsUTC - at.getTime();
}

/**
 * Returns the absolute Date corresponding to 00:00 LA on the given calendar date.
 * Calendar fields are interpreted as the LA wall clock; over- or underflow
 * (e.g., day = 35) is normalized through Date.UTC.
 */
function laMidnight(year: number, monthZeroBased: number, day: number, hour = 0): Date {
  const wallClock = Date.UTC(year, monthZeroBased, day, hour);
  let instant = wallClock;
  // Resolve the offset at the target local hour, including DST transition days.
  for (let i = 0; i < 3; i++) instant = wallClock - laOffsetMs(new Date(instant));
  return new Date(instant);
}

/** Returns the start of the challenge period at 00:00 Pacific. */
export function getWeekStart(weekNumber: number): Date {
  if (weekNumber >= FIRST_MONTHLY_CHALLENGE) {
    return laMidnight(2026, 9 + weekNumber - FIRST_MONTHLY_CHALLENGE, 1);
  }
  return laMidnight(BASE_YEAR, BASE_MONTH_ZERO, BASE_DAY + (weekNumber - 1) * 14);
}

/** Announcement time follows the boundary date at 09:00 Pacific wall time. */
export function getChallengeAnnouncementTime(challenge: number): Date {
  const date = getWeekStart(challenge);
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(date);
  const part = (type: string) => Number(parts.find(p => p.type === type)?.value);
  return laMidnight(part('year'), part('month') - 1, part('day'), 9);
}

/** Returns the last millisecond before the next challenge starts. */
export function getWeekEnd(weekNumber: number): Date {
  return new Date(getWeekStart(weekNumber + 1).getTime() - 1);
}

/** Returns the seed for the given week. */
export function getWeekSeed(weekNumber: number): number {
  return weekNumber * 1337;
}

/** Returns the current week number (1-based), clamped at 1. */
export function getCurrentWeekNumber(now: Date = new Date()): number {
  if (now >= getWeekStart(FIRST_MONTHLY_CHALLENGE)) {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: 'numeric' }).formatToParts(now);
    const year = Number(parts.find(p => p.type === 'year')?.value);
    const month = Number(parts.find(p => p.type === 'month')?.value);
    return FIRST_MONTHLY_CHALLENGE + (year - 2026) * 12 + month - 10;
  }
  // Estimate by simple division, then walk to correct any DST-driven off-by-one.
  const baseMs = getWeekStart(1).getTime();
  let week = Math.max(1, Math.floor((now.getTime() - baseMs) / APPROX_WEEK_MS) + 1);
  while (week > 1 && now.getTime() < getWeekStart(week).getTime()) week--;
  while (now.getTime() >= getWeekStart(week + 1).getTime()) week++;
  return week;
}

/** Format a week boundary date for display, in the LA timezone. */
export function formatWeekDate(d: Date, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }): string {
  return d.toLocaleDateString('en-US', { ...opts, timeZone: TZ });
}
