// Shared zip cache between API routes using globalThis to survive module reloads
const CACHE_KEY = '__d2r_zip_cache__';

export function getZipCache(): Map<number, Buffer> {
  const g = globalThis as Record<string, unknown>;
  if (!g[CACHE_KEY]) {
    g[CACHE_KEY] = new Map<number, Buffer>();
  }
  return g[CACHE_KEY] as Map<number, Buffer>;
}
