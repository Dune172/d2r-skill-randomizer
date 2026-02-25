// Shared zip cache between API routes using globalThis to survive module reloads
// Key encodes all options that affect the generated ZIP
const CACHE_KEY = '__d2r_zip_cache__';

export function getZipCache(): Map<string, Buffer> {
  const g = globalThis as Record<string, unknown>;
  if (!g[CACHE_KEY]) {
    g[CACHE_KEY] = new Map<string, Buffer>();
  }
  return g[CACHE_KEY] as Map<string, Buffer>;
}

export function makeCacheKey(
  seed: number,
  playersCount: number,
  teleportStaff: boolean,
): string {
  return `${seed}:${playersCount}:${teleportStaff ? 1 : 0}`;
}
