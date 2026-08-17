import fs from 'fs';
import path from 'path';

// Default to one directory above the project so deployments (fresh clone/pull) can't wipe it.
// Override by setting COUNTER_FILE env var to any absolute path on the server.
// Production pins this to /var/www/counter.json via ecosystem.config.js.
const COUNTER_FILE = process.env.COUNTER_FILE || path.join(process.cwd(), '..', 'counter.json');
const COUNTER_BAK = `${COUNTER_FILE}.bak`;
const COUNTER_TMP = `${COUNTER_FILE}.tmp`;

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

/**
 * Read one counter file.
 *
 * Returns a number when the file holds a usable total, `0` when the file simply
 * doesn't exist yet (a genuine zero), and `null` when the file exists but can't
 * be read or parsed. That last case used to be folded into `0`, which is how the
 * total got wiped: `writeFileSync` truncates before it writes, so killing the
 * process mid-write — exactly what `pm2 reload` does on deploy while a mod is
 * generating — left an empty file. The next increment then read the empty file,
 * saw "0", and wrote `{"count":1}` over the real total. Both halves of that are
 * fixed here: writes are atomic (below), and a corrupt read is no longer
 * mistaken for zero.
 */
function readFile(file: string): number | null {
  let raw: string;
  try {
    raw = fs.readFileSync(file, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return 0;
    return null;
  }
  try {
    const count = JSON.parse(raw).count;
    return typeof count === 'number' && Number.isFinite(count) && count >= 0 ? count : null;
  } catch {
    return null;
  }
}

/** Read the live total, falling back to the backup copy. null = unknown. */
function readCountFromDisk(): number | null {
  const primary = readFile(COUNTER_FILE);
  if (primary !== null) {
    // A present-but-empty primary alongside a healthy backup means we lost a
    // write; prefer whichever is higher.
    const backup = readFile(COUNTER_BAK);
    const value = backup !== null ? Math.max(primary, backup) : primary;
    if (value > highWater) highWater = value;
    return value;
  }

  const backup = readFile(COUNTER_BAK);
  if (backup !== null) {
    console.warn(`[counter] ${COUNTER_FILE} unreadable; recovered ${backup} from backup`);
    if (backup > highWater) highWater = backup;
    return backup;
  }

  return null;
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

/** Atomic replace: a reader never observes a truncated or half-written file. */
function writeCount(count: number): void {
  const fd = fs.openSync(COUNTER_TMP, 'w');
  try {
    fs.writeFileSync(fd, JSON.stringify({ count }), 'utf-8');
    // Flush before the rename, so a machine-level crash can't leave the renamed
    // file pointing at unwritten blocks.
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(COUNTER_TMP, COUNTER_FILE);
  // Best-effort second copy, so a corrupted primary is recoverable rather than
  // restarting the count from scratch.
  try {
    fs.copyFileSync(COUNTER_FILE, COUNTER_BAK);
  } catch {
    // A missing backup only costs us recoverability, never correctness.
  }
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
    writeCount(count);
    highWater = count;
    // Refresh cache immediately so the UI sees the new total without waiting
    // for the TTL to expire.
    cached = { value: count, stamp: Date.now() };
  }).catch(err => {
    console.error('[counter] increment failed:', err);
  });
}
