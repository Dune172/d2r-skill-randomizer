import path from 'path';

import { readJsonWithBackup, writeJsonDurable } from './durable-json';

// Default to one directory above the project so deployments (fresh clone/pull) can't wipe it.
// Override by setting COUNTER_FILE env var to any absolute path on the server.
// Production pins this to /var/www/counter.json via ecosystem.config.js.
const COUNTER_FILE = process.env.COUNTER_FILE || path.join(process.cwd(), '..', 'counter.json');

let writeLock: Promise<void> = Promise.resolve();

// 5s in-memory TTL cache to keep /api/counter from hitting disk on every
// homepage visit. Write path invalidates the cache so UI stays fresh after
// a new mod is generated.
const CACHE_TTL_MS = 5_000;
let cached: { value: number; stamp: number } = { value: -1, stamp: 0 };

// Highest total this process has ever seen. The counter only ever goes up, so
// this is a floor: it stops a transient read failure from walking the total
// backwards while the process is alive.
let highWater = -1;

interface CounterFile { count: number }

function isCounterFile(v: unknown): v is CounterFile {
  const count = (v as CounterFile | null)?.count;
  return typeof count === 'number' && Number.isFinite(count) && count >= 0;
}

/**
 * Current total, or null when neither the primary nor the backup can be read.
 * Null is deliberately NOT collapsed to 0 — see durable-json.ts for why that
 * conflation is what wiped the total on the v0.260 deploy.
 */
function readCountFromDisk(): number | null {
  const read = readJsonWithBackup(
    COUNTER_FILE,
    isCounterFile,
    // The count never decreases, so a primary below the backup means we lost a
    // write. Take the higher of the two.
    (primary, backup) => backup.count > primary.count,
  );
  if (read.status === 'unreadable') return null;
  const value = read.status === 'missing' ? 0 : read.value.count;
  if (value > highWater) highWater = value;
  return value;
}

function readCountCached(): number | null {
  const now = Date.now();
  if (cached.value >= 0 && now - cached.stamp < CACHE_TTL_MS) {
    return cached.value;
  }
  const value = readCountFromDisk();
  if (value === null) return highWater >= 0 ? highWater : null;
  cached = { value, stamp: now };
  return value;
}

/** Current total. Falls back to 0 for display when the total is unknown. */
export function getCount(): number {
  return readCountCached() ?? 0;
}

export function incrementCount(): void {
  writeLock = writeLock.then(() => {
    const current = readCountFromDisk();

    if (current === null) {
      // Both copies are unreadable. Writing "1" here would silently discard the
      // real total forever, which is strictly worse than dropping this one
      // increment — the total can be restored by hand, a lost total cannot.
      console.error(
        `[counter] refusing to increment: neither ${COUNTER_FILE} nor its backup is readable. ` +
        `Restore the total manually, e.g. echo '{"count":N}' > ${COUNTER_FILE}`,
      );
      return;
    }

    const count = Math.max(current, highWater) + 1;
    writeJsonDurable(COUNTER_FILE, { count });
    highWater = count;
    // Refresh cache immediately so the UI sees the new total without waiting
    // for the TTL to expire.
    cached = { value: count, stamp: Date.now() };
  }).catch(err => {
    console.error('[counter] increment failed:', err);
  });
}
