/**
 * Seasonal HD overlays: prebuilt files (scripts/build-<season>-overlay.mjs)
 * shipped as data/<season>/overlay.zip, entries relative to the mod's data/
 * folder. Loaded lazily on the first in-season generation and kept in memory
 * (~50 MB) — only the current season's overlay is ever touched.
 *
 * Future-proofing: an overlay contains modified copies of vanilla game files
 * (town presets, Act 1 biomes and lighting). It is stamped with the
 * DataVersionBuild it was built against and is only shipped while
 * data/dataversionbuild.txt still matches; after a D2R patch it is skipped
 * (with a warning) rather than overwriting patched files with stale copies,
 * until the overlay is rebuilt (docs/autumn-towns.md, docs/winter-towns.md).
 */
import AdmZip from 'adm-zip';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { currentSeason, type Season } from './season';

const DATA_DIR = path.join(process.cwd(), 'data');

interface Overlay { files: Map<string, Buffer>; hash: string }
const overlays = new Map<Season, Overlay | null>();

function load(season: Season): Overlay | null {
  if (overlays.has(season)) return overlays.get(season)!;
  let overlay: Overlay | null = null;
  try {
    const raw = fs.readFileSync(path.join(DATA_DIR, season, 'overlay.zip'));
    const zip = new AdmZip(raw);
    const manifestName = `_${season}_manifest.json`;
    const manifest = JSON.parse(zip.readAsText(manifestName) || '{}');
    const current = fs.readFileSync(path.join(DATA_DIR, 'dataversionbuild.txt'), 'utf8').trim();
    if (manifest.dataVersionBuild !== current) {
      console.warn(`[${season}] overlay built for DataVersionBuild ${manifest.dataVersionBuild}, game data is ${current}: skipping the overlay until it is rebuilt (docs/${season}-towns.md)`);
    } else {
      const files = new Map<string, Buffer>();
      for (const entry of zip.getEntries()) {
        if (!entry.isDirectory && entry.entryName !== manifestName) files.set(entry.entryName, entry.getData());
      }
      overlay = { files, hash: crypto.createHash('sha1').update(raw).digest('hex').slice(0, 10) };
    }
  } catch (err) {
    console.warn(`[${season}] overlay unavailable:`, err);
  }
  overlays.set(season, overlay);
  return overlay;
}

/** Files to add under the mod's data/ folder, or undefined out of season / when unusable. */
export function seasonFilesForNow(at: Date = new Date()): Map<string, Buffer> | undefined {
  const season = currentSeason(at);
  return season ? load(season)?.files : undefined;
}

/**
 * Cache-key suffix. In season it names the exact overlay build, so rebuilding
 * the overlay (or it being skipped after a game patch) never serves a stale ZIP.
 */
export function seasonCacheTag(at: Date = new Date()): string {
  const season = currentSeason(at);
  if (!season) return '';
  const o = load(season);
  return o ? `:${season}-${o.hash}` : `:${season}-off`;
}
