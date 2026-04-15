import fs from 'fs';
import path from 'path';

// Default to one directory above the project so deployments (fresh clone/pull) can't wipe it.
// Override by setting COUNTER_FILE env var to any absolute path on the server.
const COUNTER_FILE = process.env.COUNTER_FILE || path.join(process.cwd(), '..', 'counter.json');

let writeLock: Promise<void> = Promise.resolve();

// 5s in-memory TTL cache to keep /api/counter from hitting disk on every
// homepage visit. Write path invalidates the cache so UI stays fresh after
// a new mod is generated.
const CACHE_TTL_MS = 5_000;
let cached: { value: number; stamp: number } = { value: -1, stamp: 0 };

function readCountFromDisk(): number {
  try {
    const raw = fs.readFileSync(COUNTER_FILE, 'utf-8');
    return JSON.parse(raw).count ?? 0;
  } catch {
    return 0;
  }
}

function readCountCached(): number {
  const now = Date.now();
  if (cached.value >= 0 && now - cached.stamp < CACHE_TTL_MS) {
    return cached.value;
  }
  cached = { value: readCountFromDisk(), stamp: now };
  return cached.value;
}

export function getCount(): number {
  return readCountCached();
}

export function incrementCount(): void {
  writeLock = writeLock.then(() => {
    const count = readCountFromDisk() + 1;
    fs.writeFileSync(COUNTER_FILE, JSON.stringify({ count }), 'utf-8');
    // Refresh cache immediately so the UI sees the new total without waiting
    // for the TTL to expire.
    cached = { value: count, stamp: Date.now() };
  }).catch(() => {});
}
