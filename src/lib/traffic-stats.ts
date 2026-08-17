import { readJsonWithBackup, writeJsonDurable } from './durable-json';
import { statePath } from './state-dir';

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

const STATS_FILE = process.env.TRAFFIC_STATS_FILE || statePath('traffic-stats.json');

// Same reasoning as counter.ts: surface the resolved path at startup so a
// mismatch with the file being inspected isn't invisible.
console.log(`[traffic-stats] using ${STATS_FILE}`);

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

function isStatsFile(v: unknown): v is StatsFile {
  const days = (v as StatsFile | null)?.days;
  return typeof days === 'object' && days !== null && !Array.isArray(days);
}

/**
 * Read the stats file, or null when neither it nor its backup is readable.
 *
 * A corrupt read must NOT collapse to "no history": recordHit writes the whole
 * file back, so returning an empty object here would overwrite every recorded
 * day with just the current hit. See durable-json.ts.
 */
function readFromDisk(): StatsFile | null {
  const read = readJsonWithBackup(
    STATS_FILE,
    isStatsFile,
    // History only grows (bar the 366-day prune), so a primary with no days at
    // all next to a populated backup means the primary was reset by an older
    // build or a lost write.
    (primary, backup) =>
      Object.keys(primary.days).length === 0 && Object.keys(backup.days).length > 0,
  );
  if (read.status === 'unreadable') return null;
  return read.status === 'missing' ? { days: {} } : { days: read.value.days };
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
      if (stats === null) {
        // Dropping one hit beats overwriting the whole history with it.
        console.error(
          `[traffic-stats] refusing to record: neither ${STATS_FILE} nor its backup is readable`,
        );
        return;
      }
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
      writeJsonDurable(STATS_FILE, stats);
    })
    .catch(err => {
      console.error('[traffic-stats] recordHit failed:', err);
    });
}

export interface StatsSummary {
  rangeDays: number;
  since: string;
  /**
   * Earliest day ever recorded, across the whole file rather than the requested
   * range — null when nothing has been recorded yet. Consumers need this to
   * tell "no visitors that day" from "not measuring yet": before this date the
   * absence of a number means no data, not a zero.
   */
  trackingSince: string | null;
  total: number;
  byDay: Record<string, number>;
  sources: Record<string, number>;
  referrers: Record<string, number>;
  paths: Record<string, number>;
}

/** Aggregate the last `rangeDays` days (UTC). */
export function getStats(rangeDays = 30): StatsSummary {
  // An unreadable file reports as empty here — this is display only, and it
  // never feeds back into a write.
  const stats = readFromDisk() ?? { days: {} };
  const cutoff = utcDayKey(new Date(Date.now() - (rangeDays - 1) * 86_400_000));
  const recordedDays = Object.keys(stats.days).sort();
  const summary: StatsSummary = {
    rangeDays,
    since: cutoff,
    trackingSince: recordedDays[0] ?? null,
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
