/**
 * build-skill-icon-assets.mjs
 *
 * One-shot: downscale the 240 "normal" skill-icon frames under
 * data/sprites/icons/<Folder>/<Folder>_<evenCel>.bmp (PNGs despite the
 * extension, 132x130 RGBA) into 96x96 WebP tiles at
 * public/skill-icons/v1/<classCode>_<cel>.webp, for the web spoiler grid.
 *
 * Only even cels are emitted: IconCel is the normal frame and IconCel+1 the
 * "pressed" frame, which only the game UI uses (see icon-assembler.ts).
 *
 * Tiles are named by ClassCode (ama, sor, ...) rather than icon folder so the
 * browser can build a URL straight from the `iconClass` the preview API emits,
 * with no mapping table shipped to the client.
 *
 * Output is committed. Regenerating is only needed if the source icons or the
 * TILE/QUALITY constants change. If TILE or QUALITY change, bump ASSET_VERSION
 * here AND SKILL_ICON_VERSION in src/lib/ui/skill-icons.ts, because
 * next.config.ts serves this directory `immutable`.
 *
 * Usage:
 *   node scripts/build-skill-icon-assets.mjs
 *
 * Idempotent. Exits 1 if the class map, source folders, frame set, or output
 * budget don't line up — unlike the server-side assembler, which degrades a
 * missing icon to a transparent frame, the web path must fail loudly rather
 * than ship blank cells.
 */
import fs from 'fs';
import path from 'path';

import sharp from 'sharp';

const ROOT = process.cwd();
const CONFIG_TS = path.join(ROOT, 'src', 'lib', 'randomizer', 'config.ts');
const ICONS_DIR = path.join(ROOT, 'data', 'sprites', 'icons');

const ASSET_VERSION = 'v1';
const OUT_DIR = path.join(ROOT, 'public', 'skill-icons', ASSET_VERSION);

// Sources are 132x130. Rendered cells land at 46-68px across breakpoints
// (see the spoiler layout), so 96px stays crisp at 1.4x-2.1x density.
// `fit: 'fill'` squashes 132:130 to 1:1 — a 1.5% distortion, invisible, and
// the same thing icon-assembler.ts's plain .resize() already does.
const TILE = 96;
// alphaQuality matters more than quality here: the icons are irregularly
// shaped with transparent surrounds that fringe visibly against dark panels.
const QUALITY = 78;
const ALPHA_QUALITY = 90;

const CELS = Array.from({ length: 30 }, (_, i) => i * 2); // 0, 2, ... 58

// Budget guards. If the total overshoots, drop QUALITY to 70 before touching
// TILE — icon legibility is the entire point of these assets.
const MAX_TOTAL_BYTES = 1.5 * 1024 * 1024;
const MAX_TILE_BYTES = 12 * 1024;

/**
 * Read the ClassCode -> icon folder pairs straight out of CLASS_DEFS instead of
 * retyping them. Adding a class to config.ts then emits its tiles automatically;
 * renaming a folder without moving the files fails loudly below.
 */
function readClassPairs() {
  const src = fs.readFileSync(CONFIG_TS, 'utf-8');
  const pairs = [...src.matchAll(/code:\s*'(\w+)'[^}]*iconFolder:\s*'(\w+)'/g)]
    .map(m => ({ code: m[1], folder: m[2] }));
  if (pairs.length !== 8) {
    throw new Error(`Expected 8 CLASS_DEFS rows in ${CONFIG_TS}, parsed ${pairs.length}`);
  }
  return pairs;
}

function assertSourcesComplete(pairs) {
  const missing = [];
  for (const { folder } of pairs) {
    const dir = path.join(ICONS_DIR, folder);
    if (!fs.existsSync(dir)) {
      missing.push(dir);
      continue;
    }
    for (const cel of CELS) {
      const file = path.join(dir, `${folder}_${cel}.bmp`);
      if (!fs.existsSync(file)) missing.push(file);
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `Missing ${missing.length} source icon path(s):\n  ${missing.slice(0, 10).join('\n  ')}` +
      (missing.length > 10 ? `\n  ...and ${missing.length - 10} more` : ''),
    );
  }
}

async function main() {
  const pairs = readClassPairs();
  assertSourcesComplete(pairs);

  fs.mkdirSync(OUT_DIR, { recursive: true });

  let totalIn = 0;
  let totalOut = 0;
  const oversized = [];

  for (const { code, folder } of pairs) {
    let classIn = 0;
    let classOut = 0;

    for (const cel of CELS) {
      const inPath = path.join(ICONS_DIR, folder, `${folder}_${cel}.bmp`);
      const outPath = path.join(OUT_DIR, `${code}_${cel}.webp`);

      await sharp(inPath)
        .resize(TILE, TILE, { fit: 'fill' })
        .ensureAlpha()
        .webp({ quality: QUALITY, alphaQuality: ALPHA_QUALITY, effort: 6 })
        .toFile(outPath);

      const inSize = fs.statSync(inPath).size;
      const outSize = fs.statSync(outPath).size;
      classIn += inSize;
      classOut += outSize;
      if (outSize > MAX_TILE_BYTES) oversized.push(`${code}_${cel}.webp (${(outSize / 1024).toFixed(1)}KB)`);
    }

    totalIn += classIn;
    totalOut += classOut;
    console.log(
      `${(code + ' / ' + folder).padEnd(22)} ${CELS.length} tiles  ` +
      `${(classIn / 1024).toFixed(0).padStart(5)}KB → ${(classOut / 1024).toFixed(0).padStart(4)}KB`,
    );
  }

  const count = pairs.length * CELS.length;
  console.log(
    `\n${count} tiles at ${TILE}x${TILE} (q${QUALITY}/a${ALPHA_QUALITY}): ` +
    `${(totalIn / 1024 / 1024).toFixed(1)}MB → ${(totalOut / 1024).toFixed(0)}KB ` +
    `(avg ${(totalOut / count / 1024).toFixed(1)}KB)`,
  );
  console.log(`Written to public/skill-icons/${ASSET_VERSION}/`);

  const problems = [];
  if (totalOut > MAX_TOTAL_BYTES) {
    problems.push(`Total ${(totalOut / 1024 / 1024).toFixed(2)}MB exceeds the ${(MAX_TOTAL_BYTES / 1024 / 1024).toFixed(1)}MB budget`);
  }
  if (oversized.length > 0) {
    problems.push(`${oversized.length} tile(s) over ${MAX_TILE_BYTES / 1024}KB: ${oversized.slice(0, 5).join(', ')}`);
  }
  if (problems.length > 0) {
    console.error(`\nFAIL:\n  ${problems.join('\n  ')}`);
    console.error('  Drop QUALITY to 70 before reducing TILE.');
    process.exit(1);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
