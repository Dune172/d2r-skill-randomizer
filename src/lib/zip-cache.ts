// Two-tier ZIP cache: hot in-memory LRU backed by a persistent on-disk store.
// Keys are prefixed with PIPELINE_VERSION so the cache auto-invalidates (and
// disk entries from older versions are purged on boot) when the deterministic
// pipeline changes. Within a version, cached ZIPs survive server restarts so
// shared seeds stay reproducible across app updates.
//
// Disk layout: <cacheDir>/<sha1(cacheKey)>.zip + <sha1(cacheKey)>.json sidecar
// holding { cacheKey, bytes, lastAccess } for LRU bookkeeping.

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { PIPELINE_VERSION } from './randomizer/pipeline-version';

const CACHE_KEY = '__d2r_zip_cache__';
const CACHE_META_KEY = '__d2r_zip_cache_meta__';
const DISK_INDEX_KEY = '__d2r_zip_cache_disk_index__';
const BOOT_KEY = '__d2r_zip_cache_booted__';

// Memory (hot) tier — optimized for RAM footprint on the VPS.
const MAX_ENTRIES_MEM = 200;
const MAX_BYTES_MEM = 500 * 1024 * 1024;

// Disk (cold) tier — authoritative store. ~3GB fits thousands of ZIPs on
// a VPS without threatening filesystem headroom.
const MAX_ENTRIES_DISK = 2000;
const MAX_BYTES_DISK = 3 * 1024 * 1024 * 1024;

function cacheDir(): string {
  return path.join(process.cwd(), '..', 'zip-cache');
}

function keyHash(cacheKey: string): string {
  return crypto.createHash('sha1').update(cacheKey).digest('hex');
}

function zipPath(hash: string): string { return path.join(cacheDir(), `${hash}.zip`); }
function sidecarPath(hash: string): string { return path.join(cacheDir(), `${hash}.json`); }

type ZipCacheMeta = { bytes: number };

// Disk index entry — tracked in-memory so we don't stat the disk per request.
// `lastAccess` drives LRU eviction and is flushed to sidecar on promote/write.
type DiskEntry = { cacheKey: string; hash: string; bytes: number; lastAccess: number };

function getMemMeta(): ZipCacheMeta {
  const g = globalThis as Record<string, unknown>;
  if (!g[CACHE_META_KEY]) g[CACHE_META_KEY] = { bytes: 0 } as ZipCacheMeta;
  return g[CACHE_META_KEY] as ZipCacheMeta;
}

function getMem(): Map<string, Buffer> {
  const g = globalThis as Record<string, unknown>;
  if (!g[CACHE_KEY]) g[CACHE_KEY] = new Map<string, Buffer>();
  return g[CACHE_KEY] as Map<string, Buffer>;
}

// Disk index: cacheKey → DiskEntry. Kept in insertion (LRU) order by
// deleting+re-inserting on access, matching the in-memory Map convention.
function getDiskIndex(): Map<string, DiskEntry> {
  const g = globalThis as Record<string, unknown>;
  if (!g[DISK_INDEX_KEY]) g[DISK_INDEX_KEY] = new Map<string, DiskEntry>();
  return g[DISK_INDEX_KEY] as Map<string, DiskEntry>;
}

function versionPrefix(): string {
  return `v${PIPELINE_VERSION}:`;
}

/**
 * Scan the cache directory once per process, rebuild the disk index, and
 * purge entries from older pipeline versions. Idempotent — subsequent calls
 * are no-ops. Wrapped in try/catch so a corrupt cache dir can't prevent boot.
 */
function ensureBooted(): void {
  const g = globalThis as Record<string, unknown>;
  if (g[BOOT_KEY]) return;
  g[BOOT_KEY] = true;

  const dir = cacheDir();
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      return;
    }
  } catch (err) {
    console.warn(`[zip-cache] cannot create cache dir ${dir}:`, err);
    return;
  }

  let files: string[] = [];
  try {
    files = fs.readdirSync(dir);
  } catch (err) {
    console.warn(`[zip-cache] cannot read cache dir ${dir}:`, err);
    return;
  }

  const prefix = versionPrefix();
  const entries: DiskEntry[] = [];
  let purgedVersion = 0;
  let purgedOrphan = 0;

  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    const hash = f.slice(0, -5);
    const sidecar = path.join(dir, f);
    const zip = zipPath(hash);

    try {
      const raw = fs.readFileSync(sidecar, 'utf-8');
      const meta = JSON.parse(raw) as { cacheKey?: string; bytes?: number; lastAccess?: number };

      // Prune entries from stale pipeline versions so the disk budget
      // doesn't accumulate dead weight across bumps.
      if (typeof meta.cacheKey !== 'string' || !meta.cacheKey.startsWith(prefix)) {
        try { fs.unlinkSync(sidecar); } catch { /* ignore */ }
        try { fs.unlinkSync(zip); } catch { /* ignore */ }
        purgedVersion++;
        continue;
      }

      // Sidecar without a matching zip = corrupt half-write; drop it.
      if (!fs.existsSync(zip)) {
        try { fs.unlinkSync(sidecar); } catch { /* ignore */ }
        purgedOrphan++;
        continue;
      }

      const bytes = typeof meta.bytes === 'number' ? meta.bytes : fs.statSync(zip).size;
      const lastAccess = typeof meta.lastAccess === 'number' ? meta.lastAccess : Date.now();
      entries.push({ cacheKey: meta.cacheKey, hash, bytes, lastAccess });
    } catch {
      // Malformed sidecar — drop it and any orphaned zip.
      try { fs.unlinkSync(sidecar); } catch { /* ignore */ }
      try { fs.unlinkSync(zip); } catch { /* ignore */ }
      purgedOrphan++;
    }
  }

  // Also sweep orphaned .zip files that have no sidecar at all. Guard on the
  // zip still existing so files already unlinked by the version-purge pass
  // above aren't double-counted here.
  for (const f of files) {
    if (!f.endsWith('.zip')) continue;
    const hash = f.slice(0, -4);
    const zp = zipPath(hash);
    if (!fs.existsSync(zp)) continue;
    if (!fs.existsSync(sidecarPath(hash))) {
      try { fs.unlinkSync(zp); } catch { /* ignore */ }
      purgedOrphan++;
    }
  }

  // Sort ascending by lastAccess so oldest ends up at Map head (first to evict).
  entries.sort((a, b) => a.lastAccess - b.lastAccess);
  const index = getDiskIndex();
  for (const e of entries) index.set(e.cacheKey, e);

  console.log(
    `[zip-cache] booted version=${PIPELINE_VERSION} entries=${entries.length} ` +
    `purgedVersion=${purgedVersion} purgedOrphan=${purgedOrphan}`,
  );
}

function diskBytes(): number {
  let total = 0;
  for (const e of getDiskIndex().values()) total += e.bytes;
  return total;
}

function evictDiskIfNeeded(): void {
  const index = getDiskIndex();
  while (index.size > MAX_ENTRIES_DISK || diskBytes() > MAX_BYTES_DISK) {
    const firstKey = index.keys().next().value;
    if (firstKey === undefined) break;
    const victim = index.get(firstKey);
    if (!victim) { index.delete(firstKey); continue; }
    try { fs.unlinkSync(zipPath(victim.hash)); } catch { /* ignore */ }
    try { fs.unlinkSync(sidecarPath(victim.hash)); } catch { /* ignore */ }
    index.delete(firstKey);
  }
}

function evictMemIfNeeded(): void {
  const cache = getMem();
  const meta = getMemMeta();
  while (cache.size > MAX_ENTRIES_MEM || meta.bytes > MAX_BYTES_MEM) {
    const firstKey = cache.keys().next().value;
    if (firstKey === undefined) break;
    const victim = cache.get(firstKey);
    if (victim) meta.bytes -= victim.byteLength;
    cache.delete(firstKey);
  }
}

export function getZipCache(): Map<string, Buffer> {
  ensureBooted();
  return getMem();
}

export function getZipCacheStats(): {
  entries: number; bytes: number; maxEntries: number; maxBytes: number;
  diskEntries: number; diskBytes: number; maxDiskEntries: number; maxDiskBytes: number;
  pipelineVersion: number;
} {
  ensureBooted();
  return {
    entries: getMem().size,
    bytes: getMemMeta().bytes,
    maxEntries: MAX_ENTRIES_MEM,
    maxBytes: MAX_BYTES_MEM,
    diskEntries: getDiskIndex().size,
    diskBytes: diskBytes(),
    maxDiskEntries: MAX_ENTRIES_DISK,
    maxDiskBytes: MAX_BYTES_DISK,
    pipelineVersion: PIPELINE_VERSION,
  };
}

function writeToDisk(cacheKey: string, buf: Buffer): void {
  const hash = keyHash(cacheKey);
  const dir = cacheDir();
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(zipPath(hash), buf);
    const entry: DiskEntry = {
      cacheKey, hash, bytes: buf.byteLength, lastAccess: Date.now(),
    };
    fs.writeFileSync(sidecarPath(hash), JSON.stringify(entry));

    const index = getDiskIndex();
    // Re-insert so the Map's insertion order reflects most-recent.
    index.delete(cacheKey);
    index.set(cacheKey, entry);
    evictDiskIfNeeded();
  } catch (err) {
    console.warn(`[zip-cache] disk write failed for ${cacheKey}:`, err);
  }
}

/**
 * Insert a ZIP. Writes to disk (authoritative) and populates the hot memory
 * tier. Both tiers enforce their own LRU budget.
 */
export function setCached(key: string, buf: Buffer): void {
  ensureBooted();
  const cache = getMem();
  const meta = getMemMeta();

  const existing = cache.get(key);
  if (existing) meta.bytes -= existing.byteLength;

  cache.set(key, buf);
  meta.bytes += buf.byteLength;
  evictMemIfNeeded();

  writeToDisk(key, buf);
}

/**
 * Read a ZIP. Memory hit → promoted to most-recent, returned. Memory miss +
 * disk hit → loaded, promoted into memory, sidecar `lastAccess` updated.
 */
export function getCached(key: string): Buffer | undefined {
  ensureBooted();
  const cache = getMem();
  const buf = cache.get(key);
  if (buf !== undefined) {
    cache.delete(key);
    cache.set(key, buf);
    touchDisk(key);
    return buf;
  }

  const index = getDiskIndex();
  const entry = index.get(key);
  if (!entry) return undefined;

  try {
    const loaded = fs.readFileSync(zipPath(entry.hash));
    // Promote into memory + refresh LRU on both tiers.
    const meta = getMemMeta();
    meta.bytes += loaded.byteLength;
    cache.set(key, loaded);
    evictMemIfNeeded();
    touchDisk(key);
    return loaded;
  } catch (err) {
    console.warn(`[zip-cache] disk read failed for ${key}; dropping index entry:`, err);
    index.delete(key);
    try { fs.unlinkSync(sidecarPath(entry.hash)); } catch { /* ignore */ }
    try { fs.unlinkSync(zipPath(entry.hash)); } catch { /* ignore */ }
    return undefined;
  }
}

/**
 * Update disk LRU ordering without rewriting the zip. Sidecar write is
 * best-effort; failure only affects eviction ordering, not correctness.
 */
function touchDisk(key: string): void {
  const index = getDiskIndex();
  const entry = index.get(key);
  if (!entry) return;
  entry.lastAccess = Date.now();
  index.delete(key);
  index.set(key, entry);
  try {
    fs.writeFileSync(sidecarPath(entry.hash), JSON.stringify(entry));
  } catch { /* ignore — LRU drift is acceptable */ }
}

export function hasCached(key: string): boolean {
  ensureBooted();
  if (getMem().has(key)) return true;
  return getDiskIndex().has(key);
}

/**
 * Build the cache key. Every key is prefixed with the current PIPELINE_VERSION
 * so cache entries auto-invalidate when the deterministic pipeline changes.
 */
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
  teleportStaffSpeed: boolean = true,
  excludeTeleport: boolean = false,
  expandProcPool: boolean = false,
): string {
  const actsKey = [...playersActs].sort((a, b) => a - b).join('');
  const xpActsKey = [...xpActs].sort((a, b) => a - b).join('');
  return `${versionPrefix()}${seed}:${playersCount}:${teleportStaffLevel}:${actsKey}:${hirelingAura?1:0}:${dropSource}:${disableChat?1:0}:${horadricCube?1:0}:${enablePrereqs?1:0}:${xpMultiplier}:${xpActsKey}:${weeklyKey}:${teleportStaffSpeed?1:0}:${excludeTeleport?1:0}:${expandProcPool?1:0}`;
}
