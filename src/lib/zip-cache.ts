// Shared zip cache between API routes using globalThis to survive module reloads.
// Byte-bounded LRU: keep up to MAX_ENTRIES entries AND at most MAX_BYTES total,
// evicting in insertion order until both limits are satisfied. Touching an entry
// on read re-inserts it to make it most-recent.
//
// Key encodes all options that affect the generated ZIP.

const CACHE_KEY = '__d2r_zip_cache__';
const CACHE_META_KEY = '__d2r_zip_cache_meta__';

// Tuning — adjusted post-traffic-spike prep. Average ZIP is ~3-5MB, so
// ~200 entries / 500MB fits a hot set of popular seeds + weekly challenge
// variations comfortably on a VPS with ≥1GB free.
const MAX_ENTRIES = 200;
const MAX_BYTES = 500 * 1024 * 1024;

// Unique token per process start — busts stale cache entries after server restarts
const STARTUP_TOKEN = Date.now().toString(36);

type ZipCacheMeta = { bytes: number };

function getMeta(): ZipCacheMeta {
  const g = globalThis as Record<string, unknown>;
  if (!g[CACHE_META_KEY]) g[CACHE_META_KEY] = { bytes: 0 } as ZipCacheMeta;
  return g[CACHE_META_KEY] as ZipCacheMeta;
}

export function getZipCache(): Map<string, Buffer> {
  const g = globalThis as Record<string, unknown>;
  if (!g[CACHE_KEY]) {
    g[CACHE_KEY] = new Map<string, Buffer>();
  }
  return g[CACHE_KEY] as Map<string, Buffer>;
}

export function getZipCacheStats(): { entries: number; bytes: number; maxEntries: number; maxBytes: number } {
  return {
    entries: getZipCache().size,
    bytes: getMeta().bytes,
    maxEntries: MAX_ENTRIES,
    maxBytes: MAX_BYTES,
  };
}

/**
 * Insert into the ZIP cache with LRU + byte-budget eviction.
 * Callers should prefer this over direct `.set()` so the byte accounting stays
 * accurate.
 */
export function setCached(key: string, buf: Buffer): void {
  const cache = getZipCache();
  const meta = getMeta();

  // Replace existing entry — subtract its size before counting the new one so
  // we don't double-count.
  const existing = cache.get(key);
  if (existing) meta.bytes -= existing.byteLength;

  cache.set(key, buf);
  meta.bytes += buf.byteLength;

  // Evict oldest until under both limits. Map iteration is insertion order.
  while (cache.size > MAX_ENTRIES || meta.bytes > MAX_BYTES) {
    const firstKey = cache.keys().next().value;
    if (firstKey === undefined) break;
    const victim = cache.get(firstKey);
    if (victim) meta.bytes -= victim.byteLength;
    cache.delete(firstKey);
  }
}

/**
 * Cache lookup. On hit, re-inserts the entry so it becomes most-recent — this
 * is what makes the map an LRU rather than FIFO.
 */
export function getCached(key: string): Buffer | undefined {
  const cache = getZipCache();
  const buf = cache.get(key);
  if (buf === undefined) return undefined;
  // Re-insert to move to end of iteration order.
  cache.delete(key);
  cache.set(key, buf);
  return buf;
}

export function hasCached(key: string): boolean {
  return getZipCache().has(key);
}

export function makeCacheKey(
  seed: number,
  playersCount: number,
  teleportStaffLevel: number,
  playersActs: number[] = [1, 2, 3, 4, 5],
  hirelingAura: boolean = true,
  dropSource: string = 'Corpsefire',
  disableChat: boolean = false,
  horadricCube: boolean = false,
  enablePrereqs: boolean = true,
  xpMultiplier: number = 1,
  xpActs: number[] = [1, 2, 3, 4, 5],
  weeklyKey: number = 0,
): string {
  const actsKey = [...playersActs].sort((a, b) => a - b).join('');
  const xpActsKey = [...xpActs].sort((a, b) => a - b).join('');
  return `${STARTUP_TOKEN}:${seed}:${playersCount}:${teleportStaffLevel}:${actsKey}:${hirelingAura?1:0}:${dropSource}:${disableChat?1:0}:${horadricCube?1:0}:${enablePrereqs?1:0}:${xpMultiplier}:${xpActsKey}:${weeklyKey}`;
}
