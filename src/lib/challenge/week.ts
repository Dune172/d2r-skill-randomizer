/**
 * Mutation challenge calendar — anchored to midnight in the America/Los_Angeles
 * timezone. Each 14-day challenge seed flips at 00:00 LA local time every other
 * Monday, so the boundary moves with DST instead of drifting an hour twice a year.
 *
 * Imported by both client and server code (browser, Node, Edge runtime), so
 * it relies only on Intl.DateTimeFormat which is available in all targets.
 */

const TZ = 'America/Los_Angeles';

// Week 1 starts at midnight LA on this date.
const BASE_YEAR = 2026;
const BASE_MONTH_ZERO = 3; // April (0-based)
const BASE_DAY = 13;

const APPROX_WEEK_MS = 14 * 24 * 60 * 60 * 1000;

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
function laMidnight(year: number, monthZeroBased: number, day: number): Date {
  // Use noon UTC on the target day as a reference moment to look up the LA offset
  // (noon UTC is always within the same LA calendar date as midnight LA).
  const reference = new Date(Date.UTC(year, monthZeroBased, day, 12, 0, 0));
  const offset = laOffsetMs(reference);
  // wantedUTC = laMidnight (as if UTC) - offset
  return new Date(Date.UTC(year, monthZeroBased, day, 0, 0, 0) - offset);
}

/** Returns the Date at the start of the given challenge period (00:00 LA on its Monday). */
export function getWeekStart(weekNumber: number): Date {
  return laMidnight(BASE_YEAR, BASE_MONTH_ZERO, BASE_DAY + (weekNumber - 1) * 14);
}

/** Returns the Date 1ms before the next week starts (i.e., 23:59:59.999 LA on Sunday). */
export function getWeekEnd(weekNumber: number): Date {
  return new Date(getWeekStart(weekNumber + 1).getTime() - 1);
}

/** Returns the seed for the given week. */
export function getWeekSeed(weekNumber: number): number {
  return weekNumber * 1337;
}

/** Returns the current week number (1-based), clamped at 1. */
export function getCurrentWeekNumber(now: Date = new Date()): number {
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
