// Shared zip cache between API routes (same process)
const zipCache = new Map<number, Buffer>();

export function getZipCache(): Map<number, Buffer> {
  return zipCache;
}
