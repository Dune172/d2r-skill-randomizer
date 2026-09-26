/**
 * Autumn Towns HD overlay: prebuilt files (scripts/build-autumn-overlay.mjs)
 * shipped as data/autumn/overlay.zip, entries relative to the mod's data/
 * folder. Loaded lazily on the first in-season generation and kept in memory
 * (~50 MB) — only ever touched in October and November.
 *
 * Future-proofing: the overlay contains modified copies of vanilla game files
 * (town presets, Act 1 biomes and lighting). It is stamped with the
 * DataVersionBuild it was built against and is only shipped while
 * data/dataversionbuild.txt still matches; after a D2R patch it is skipped
 * (with a warning) rather than overwriting patched files with stale copies,
 * until the overlay is rebuilt (docs/autumn-towns.md).
 */
import AdmZip from 'adm-zip';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { isAutumnSeason } from './season';

const DATA_DIR = path.join(process.cwd(), 'data');
const MANIFEST = '_autumn_manifest.json';

interface Overlay { files: Map<string, Buffer>; hash: string }
let overlay: Overlay | null | undefined;

function load(): Overlay | null {
  if (overlay !== undefined) return overlay;
  overlay = null;
  try {
    const raw = fs.readFileSync(path.join(DATA_DIR, 'autumn', 'overlay.zip'));
    const zip = new AdmZip(raw);
    const manifest = JSON.parse(zip.readAsText(MANIFEST) || '{}');
    const current = fs.readFileSync(path.join(DATA_DIR, 'dataversionbuild.txt'), 'utf8').trim();
    if (manifest.dataVersionBuild !== current) {
      console.warn(`[autumn] overlay built for DataVersionBuild ${manifest.dataVersionBuild}, game data is ${current}: skipping the overlay until it is rebuilt (docs/autumn-towns.md)`);
      return null;
    }
    const files = new Map<string, Buffer>();
    for (const entry of zip.getEntries()) {
      if (!entry.isDirectory && entry.entryName !== MANIFEST) files.set(entry.entryName, entry.getData());
    }
    overlay = { files, hash: crypto.createHash('sha1').update(raw).digest('hex').slice(0, 10) };
  } catch (err) {
    console.warn('[autumn] overlay unavailable:', err);
  }
  return overlay;
}

/** Files to add under the mod's data/ folder, or undefined out of season / when unusable. */
export function autumnFilesForNow(at: Date = new Date()): Map<string, Buffer> | undefined {
  return isAutumnSeason(at) ? load()?.files : undefined;
}

/**
 * Cache-key suffix. In season it names the exact overlay build, so rebuilding
 * the overlay (or it being skipped after a game patch) never serves a stale ZIP.
 */
export function autumnCacheTag(at: Date = new Date()): string {
  if (!isAutumnSeason(at)) return '';
  const o = load();
  return o ? `:autumn-${o.hash}` : ':autumn-off';
}
