import fs from 'fs';
import path from 'path';

/**
 * First-party, privacy-friendly traffic attribution.
 *
 * Records one hit per browser session (the client beacon enforces this) with
 * the UTM source, referrer hostname, and landing path. No cookies, no IPs,
 * no user agents — nothing personally identifiable is stored, only daily
 * aggregate counts. Persisted one directory above the project (same pattern
 * as counter.json) so deployments can't wipe it. Single-instance only, like
 * the rest of the app's file-backed state.
 */

const STATS_FILE =
  process.env.TRAFFIC_STATS_FILE || path.join(process.cwd(), '..', 'traffic-stats.json');

/** Keep at most this many days of history. */
const MAX_DAYS = 366;
/** Cap distinct keys per map per day; overflow buckets into 'other'. */
const MAX_KEYS = 200;

export interface DayStats {
  total: number;
  sources: Record<string, number>; // utm_source, or 'direct' / 'organic'
  referrers: Record<string, number>; // referrer hostname
  paths: Record<string, number>; // landing path
}

interface StatsFile {
  days: Record<string, DayStats>; // key: YYYY-MM-DD (UTC)
}

let writeLock: Promise<void> = Promise.resolve();

function readFromDisk(): StatsFile {
  try {
    const raw = fs.readFileSync(STATS_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<StatsFile>;
    return { days: parsed.days ?? {} };
  } catch {
    return { days: {} };
  }
}

function utcDayKey(at = new Date()): string {
  return at.toISOString().slice(0, 10);
}

function bump(map: Record<string, number>, key: string): void {
  const k = key in map || Object.keys(map).length < MAX_KEYS ? key : 'other';
  map[k] = (map[k] ?? 0) + 1;
}

function prune(stats: StatsFile): void {
  const keys = Object.keys(stats.days).sort();
  while (keys.length > MAX_DAYS) {
    delete stats.days[keys.shift() as string];
  }
}

export interface HitInput {
  source: string; // sanitized utm_source, or '' if absent
  referrerHost: string; // sanitized referrer hostname, or '' if absent
  pathname: string; // sanitized landing path
}

export function recordHit(hit: HitInput): void {
  writeLock = writeLock
    .then(() => {
      const stats = readFromDisk();
      const day = (stats.days[utcDayKey()] ??= {
        total: 0,
        sources: {},
        referrers: {},
        paths: {},
      });
      day.total += 1;
      const source = hit.source || (hit.referrerHost ? 'organic' : 'direct');
      bump(day.sources, source);
      if (hit.referrerHost) bump(day.referrers, hit.referrerHost);
      bump(day.paths, hit.pathname || '/');
      prune(stats);
      fs.writeFileSync(STATS_FILE, JSON.stringify(stats), 'utf-8');
    })
    .catch(() => {});
}

export interface StatsSummary {
  rangeDays: number;
  since: string;
  total: number;
  byDay: Record<string, number>;
  sources: Record<string, number>;
  referrers: Record<string, number>;
  paths: Record<string, number>;
}

/** Aggregate the last `rangeDays` days (UTC). */
export function getStats(rangeDays = 30): StatsSummary {
  const stats = readFromDisk();
  const cutoff = utcDayKey(new Date(Date.now() - (rangeDays - 1) * 86_400_000));
  const summary: StatsSummary = {
    rangeDays,
    since: cutoff,
    total: 0,
    byDay: {},
    sources: {},
    referrers: {},
    paths: {},
  };
  for (const [day, d] of Object.entries(stats.days)) {
    if (day < cutoff) continue;
    summary.total += d.total;
    summary.byDay[day] = d.total;
    for (const [k, v] of Object.entries(d.sources)) summary.sources[k] = (summary.sources[k] ?? 0) + v;
    for (const [k, v] of Object.entries(d.referrers)) summary.referrers[k] = (summary.referrers[k] ?? 0) + v;
    for (const [k, v] of Object.entries(d.paths)) summary.paths[k] = (summary.paths[k] ?? 0) + v;
  }
  return summary;
}
