/**
 * Autumn Towns season: every mod generated in October or November
 * (America/Los_Angeles calendar, matching the challenge calendar) ships the
 * autumn HD overlay — pumpkins and jack-o'-lanterns in all five towns, autumn
 * Act 1 foliage and lighting. Purely visual; no game data changes.
 * Month-based, so it recurs every year with no further changes.
 */
const MONTH = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', month: 'numeric' });

export function isAutumnSeason(at: Date = new Date()): boolean {
  // D2RR_AUTUMN=1 / =0 forces the season on or off (previews, tests).
  const force = typeof process !== 'undefined' ? process.env?.D2RR_AUTUMN : undefined;
  if (force === '1' || force === '0') return force === '1';
  const month = Number(MONTH.format(at));
  return month === 10 || month === 11;
}
