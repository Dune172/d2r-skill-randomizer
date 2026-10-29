import { readJsonWithBackup, writeJsonDurable } from './durable-json';
import { statePath } from './state-dir';

/**
 * Daily counts of generator features, e.g. how many generations use Open Acts and which
 * of its options. One count per successful /api/randomize request (cached seeds
 * included), so it reflects how often people pick a feature, not how many ZIPs were
 * built. Aggregates only: no IPs, seeds or names. Same file-backed pattern as
 * traffic-stats.ts; single-instance only.
 */

const STATS_FILE = process.env.FEATURE_STATS_FILE || statePath('feature-stats.json');

console.log(`[feature-stats] using ${STATS_FILE}`);

const MAX_DAYS = 366;
const MAX_KEYS = 100;
const KEY = /^[a-z0-9:-]{1,48}$/;

/** Every request counts under this key, so feature shares can be worked out. */
export const ALL_GENERATIONS = 'generate';

interface StatsFile {
  days: Record<string, Record<string, number>>; // YYYY-MM-DD (UTC) → feature → count
}

let writeLock: Promise<void> = Promise.resolve();

function isStatsFile(v: unknown): v is StatsFile {
  const days = (v as StatsFile | null)?.days;
  return typeof days === 'object' && days !== null && !Array.isArray(days);
}

/** Null when neither the file nor its backup can be read (never collapse that to "empty"). */
function readFromDisk(): StatsFile | null {
  const read = readJsonWithBackup(
    STATS_FILE,
    isStatsFile,
    (primary, backup) =>
      Object.keys(primary.days).length === 0 && Object.keys(backup.days).length > 0,
  );
  if (read.status === 'unreadable') return null;
  return read.status === 'missing' ? { days: {} } : { days: read.value.days };
}

const utcDayKey = (at = new Date()) => at.toISOString().slice(0, 10);

/** Count one generation with these feature keys (ALL_GENERATIONS is added). */
export function recordFeatures(keys: readonly string[]): void {
  const clean = [ALL_GENERATIONS, ...keys.filter(k => KEY.test(k))];
  writeLock = writeLock
    .then(() => {
      const stats = readFromDisk();
      if (stats === null) {
        console.error(`[feature-stats] refusing to record: neither ${STATS_FILE} nor its backup is readable`);
        return;
      }
      const day = (stats.days[utcDayKey()] ??= {});
      for (const k of new Set(clean)) {
        const key = k in day || Object.keys(day).length < MAX_KEYS ? k : 'other';
        day[key] = (day[key] ?? 0) + 1;
      }
      const days = Object.keys(stats.days).sort();
      while (days.length > MAX_DAYS) delete stats.days[days.shift() as string];
      writeJsonDurable(STATS_FILE, stats);
    })
    .catch(err => console.error('[feature-stats] recordFeatures failed:', err));
}

export interface FeatureSummary {
  since: string;
  trackingSince: string | null;
  /** Feature → count over the range; `generate` is every generation. */
  totals: Record<string, number>;
  /** Day → feature → count. */
  byDay: Record<string, Record<string, number>>;
}

/** Aggregate the last `rangeDays` days (UTC). */
export function getFeatureStats(rangeDays = 30): FeatureSummary {
  const stats = readFromDisk() ?? { days: {} };
  const since = utcDayKey(new Date(Date.now() - (rangeDays - 1) * 86_400_000));
  const recorded = Object.keys(stats.days).sort();
  const summary: FeatureSummary = { since, trackingSince: recorded[0] ?? null, totals: {}, byDay: {} };
  for (const [day, counts] of Object.entries(stats.days)) {
    if (day < since) continue;
    summary.byDay[day] = counts;
    for (const [k, v] of Object.entries(counts)) summary.totals[k] = (summary.totals[k] ?? 0) + v;
  }
  return summary;
}
