// Shared zip cache between API routes using globalThis to survive module reloads
// Key encodes all options that affect the generated ZIP
const CACHE_KEY = '__d2r_zip_cache__';

// Unique token per process start — busts stale cache entries after server restarts
const STARTUP_TOKEN = Date.now().toString(36);

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
  teleportStaffLevel: number,
  playersActs: number[] = [1, 2, 3, 4, 5],
  logic: string = 'minimal',
  hirelingAura: boolean = true,
  hirelingSkills: boolean = true,
): string {
  const actsKey = [...playersActs].sort((a, b) => a - b).join('');
  return `${STARTUP_TOKEN}:${seed}:${playersCount}:${teleportStaffLevel}:${actsKey}:${logic}:${hirelingAura?1:0}${hirelingSkills?1:0}`;
}
