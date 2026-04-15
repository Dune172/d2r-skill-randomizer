/**
 * Reads mutation icon PNGs from public/mutations/ and returns them as base64
 * data URLs. Satori can't fetch local file paths, so the bytes must be inlined.
 *
 * Node runtime only.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ICON_DIR = join(process.cwd(), 'public', 'mutations');

const cache = new Map<string, string>();

export function mutationIconDataUrl(id: string): string | null {
  if (cache.has(id)) return cache.get(id)!;
  try {
    const bytes = readFileSync(join(ICON_DIR, `${id}.png`));
    const dataUrl = `data:image/png;base64,${bytes.toString('base64')}`;
    cache.set(id, dataUrl);
    return dataUrl;
  } catch {
    return null;
  }
}
