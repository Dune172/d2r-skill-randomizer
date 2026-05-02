/**
 * Reads mutation icon WebPs from public/mutations/ and returns them as base64
 * PNG data URLs. Satori can't fetch local file paths, so the bytes must be
 * inlined; PNG is the format Satori renders most reliably.
 *
 * Node runtime only.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

const ICON_DIR = join(process.cwd(), 'public', 'mutations');

const cache = new Map<string, string>();

export async function mutationIconDataUrl(id: string): Promise<string | null> {
  if (cache.has(id)) return cache.get(id)!;
  try {
    const webpBytes = await readFile(join(ICON_DIR, `${id}.webp`));
    const pngBytes = await sharp(webpBytes).png().toBuffer();
    const dataUrl = `data:image/png;base64,${pngBytes.toString('base64')}`;
    cache.set(id, dataUrl);
    return dataUrl;
  } catch {
    return null;
  }
}
