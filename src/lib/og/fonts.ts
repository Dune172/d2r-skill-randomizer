/**
 * Font loader for ImageResponse (satori). Reads static Cinzel TTF files from
 * disk at module init and exposes them in the format `ImageResponse` expects.
 *
 * Node runtime only — relies on node:fs and node:path.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const FONT_DIR = join(process.cwd(), 'src', 'lib', 'og', 'fonts');

function readFont(filename: string): Buffer {
  return readFileSync(join(FONT_DIR, filename));
}

const cinzel400 = readFont('cinzel-400.ttf');
const cinzel700 = readFont('cinzel-700.ttf');
const cinzel900 = readFont('cinzel-900.ttf');

export const OG_FONTS = [
  { name: 'Cinzel', data: cinzel400, weight: 400 as const, style: 'normal' as const },
  { name: 'Cinzel', data: cinzel700, weight: 700 as const, style: 'normal' as const },
  { name: 'Cinzel', data: cinzel900, weight: 900 as const, style: 'normal' as const },
];
