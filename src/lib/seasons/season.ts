/**
 * Seasonal HD overlays, by the month a mod is generated (America/Los_Angeles
 * calendar, matching the challenge calendar). Purely visual; no game data changes.
 * Month-based, so they recur every year with no further changes.
 *
 *   autumn (Oct, Nov): pumpkins and jack-o'-lanterns in all five towns, the
 *     Pumpkin King, autumn Act 1 foliage and lighting (docs/autumn-towns.md)
 *   winter (Dec, Jan): snowmen, gifts and lanterns in all five towns, snowy
 *     Act 1 ground, frosted foliage, cool lighting (docs/winter-towns.md)
 *
 * Kept dependency-free: scripts/verify-season.mjs runs it in a vm.
 */
export type Season = 'autumn' | 'winter';

export const SEASON_MONTHS: Record<Season, number[]> = {
  autumn: [10, 11],
  winter: [12, 1],
};

const MONTH = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', month: 'numeric' });

export function currentSeason(at: Date = new Date()): Season | null {
  // D2RR_SEASON=autumn|winter|off forces the season (previews, tests);
  // D2RR_AUTUMN=1|0 is the older switch for autumn alone.
  const env = typeof process !== 'undefined' ? process.env : undefined;
  const force = env?.D2RR_SEASON;
  if (force === 'autumn' || force === 'winter') return force;
  if (force === 'off') return null;
  if (env?.D2RR_AUTUMN === '1') return 'autumn';
  const month = Number(MONTH.format(at));
  const season = (Object.keys(SEASON_MONTHS) as Season[]).find(s => SEASON_MONTHS[s].includes(month)) ?? null;
  if (season === 'autumn' && env?.D2RR_AUTUMN === '0') return null;
  return season;
}
