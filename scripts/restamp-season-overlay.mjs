#!/usr/bin/env node
// Re-stamps a seasonal overlay for a new D2R build without rebuilding it, but
// only when every vanilla file it was built from is byte-identical in the new
// game data. Otherwise it refuses: rebuild instead (docs/<season>-towns.md).
//
//   node scripts/restamp-season-overlay.mjs --season autumn|winter --src <CASC extraction>/data
//
// Run after bumping data/dataversionbuild.txt. Rewrites only the manifest entry
// in data/<season>/overlay.zip (dataVersionBuild, plus a restamps log); every
// other entry is kept as is. Then run verify-season --src to confirm.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

const AdmZip = createRequire(import.meta.url)('adm-zip');
const args = process.argv.slice(2);
const arg = name => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : null);
const season = arg('season');
const src = arg('src');
if (!['autumn', 'winter'].includes(season) || !src) {
  console.error('usage: node scripts/restamp-season-overlay.mjs --season autumn|winter --src <CASC extraction>/data');
  process.exit(2);
}

const ZIP = `data/${season}/overlay.zip`;
const MANIFEST = `_${season}_manifest.json`;
const zip = new AdmZip(ZIP);
const manifest = JSON.parse(zip.readAsText(MANIFEST));
const target = fs.readFileSync('data/dataversionbuild.txt', 'utf8').trim();
if (manifest.dataVersionBuild === target) {
  console.log(`[${season}] already stamped ${target}`);
  process.exit(0);
}

const changed = Object.entries(manifest.sources).filter(([rel, sha]) =>
  !fs.existsSync(`${src}/${rel}`) || createHash('sha1').update(fs.readFileSync(`${src}/${rel}`)).digest('hex') !== sha);
if (changed.length) {
  console.error(`[${season}] ${changed.length} vanilla sources changed since the build; rebuild the overlay instead (docs/${season}-towns.md):\n  ${changed.map(([rel]) => rel).join('\n  ')}`);
  process.exit(1);
}

const from = manifest.dataVersionBuild;
const restamped = {
  ...manifest,
  dataVersionBuild: target,
  restamps: [...(manifest.restamps ?? []), { from, to: target, at: new Date().toISOString().slice(0, 10) }],
};
zip.updateFile(MANIFEST, Buffer.from(JSON.stringify(restamped, null, 1)));
zip.writeZip(ZIP);
console.log(`[${season}] ${Object.keys(manifest.sources).length} vanilla sources unchanged: re-stamped ${from} -> ${target}`);
