/**
 * build-apworld.mjs — package apworld/d2rr into an installable d2rr.apworld.
 *
 * Archipelago's apworld spec is exacting and fails quietly when you get it wrong:
 *   - the file is a ZIP named all-lowercase with a .apworld extension
 *   - it must contain ONE top-level folder whose name matches the file stem
 *   - that folder holds what would otherwise live in worlds/<game>/
 *   - its archipelago.json carries the container version fields, which Archipelago's own
 *     "Build APWorlds" adds and which a hand-rolled build has to add itself
 *
 * A wrong layout usually shows up as the game simply not appearing in the launcher,
 * with no error, so this script asserts the structure after writing it.
 *
 * Development-only files (the id dumper and the tests) are left out.
 *
 *   node scripts/build-apworld.mjs             # dist/d2rr.apworld
 *   node scripts/build-apworld.mjs --public    # also public/archipelago/d2rr.apworld, for the site
 *   node scripts/build-apworld.mjs --install   # also into Archipelago's custom_worlds
 */
import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';

const repoRoot = path.resolve(import.meta.dirname, '..');
const srcDir = path.join(repoRoot, 'apworld', 'd2rr');
const outFile = path.join(repoRoot, 'dist', 'd2rr.apworld');
const AP_DIR = process.env.ARCHIPELAGO_DIR || 'C:\\ProgramData\\Archipelago';

// The APContainer packaging scheme this layout follows (Archipelago worlds/Files.py).
const CONTAINER_VERSION = 7;

// Kept in the repo for the cross-checks and tests, but not shipped.
const EXCLUDE = [/^iddump\.py$/, /^test_tables\.py$/, /^test\//];

function collect(dir, rel = '') {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '__pycache__' || entry.name.endsWith('.pyc')) continue;
    const abs = path.join(dir, entry.name);
    const relPath = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...collect(abs, relPath));
    else if (!EXCLUDE.some(re => re.test(relPath))) out.push({ abs, relPath });
  }
  return out;
}

function main() {
  if (!fs.existsSync(srcDir)) {
    console.error(`apworld source not found at ${srcDir}`);
    process.exit(2);
  }

  const files = collect(srcDir);
  const zip = new AdmZip();
  for (const f of files) {
    let data = fs.readFileSync(f.abs);
    if (f.relPath === 'archipelago.json') {
      const manifest = JSON.parse(data.toString('utf8'));
      data = Buffer.from(JSON.stringify(
        { ...manifest, version: CONTAINER_VERSION, compatible_version: CONTAINER_VERSION }, null, 4));
    }
    // Everything nests under a "d2rr/" folder matching the .apworld stem.
    zip.addFile(`d2rr/${f.relPath}`, data);
  }

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  zip.writeZip(outFile);

  // Verify what we just wrote, rather than trusting the write.
  const check = new AdmZip(outFile);
  const entries = check.getEntries().filter(e => !e.isDirectory).map(e => e.entryName);
  const problems = [];

  for (const name of entries) {
    if (!name.startsWith('d2rr/')) problems.push(`entry outside the d2rr/ folder: ${name}`);
    if (name !== name.toLowerCase() && !name.startsWith('d2rr/docs/')) {
      problems.push(`module filename is not lowercase: ${name}`);
    }
  }
  for (const required of ['d2rr/__init__.py', 'd2rr/archipelago.json',
                          'd2rr/docs/setup_en.md', 'd2rr/docs/en_D2R Randomizer.md']) {
    if (!entries.includes(required)) problems.push(`missing: ${required}`);
  }
  if (entries.includes('d2rr/archipelago.json')) {
    const manifest = JSON.parse(check.readAsText('d2rr/archipelago.json'));
    for (const field of ['game', 'world_version', 'minimum_ap_version', 'version', 'compatible_version']) {
      if (manifest[field] === undefined) problems.push(`archipelago.json has no ${field}`);
    }
    if (!/^\d+\.\d+\.\d+$/.test(manifest.world_version ?? '')) problems.push('world_version must be major.minor.build');
  }

  if (problems.length) {
    console.error('apworld structure is invalid:');
    problems.forEach(p => console.error(`  - ${p}`));
    process.exit(1);
  }

  const size = fs.statSync(outFile).size;
  console.log(`Wrote ${path.relative(repoRoot, outFile)} (${entries.length} files, ${(size / 1024).toFixed(1)} KB)`);

  if (process.argv.includes('--public')) {
    const publicFile = path.join(repoRoot, 'public', 'archipelago', 'd2rr.apworld');
    fs.mkdirSync(path.dirname(publicFile), { recursive: true });
    fs.copyFileSync(outFile, publicFile);
    console.log(`Copied to ${path.relative(repoRoot, publicFile)}`);
  }
  if (process.argv.includes('--install')) {
    const target = path.join(AP_DIR, 'custom_worlds', 'd2rr.apworld');
    fs.copyFileSync(outFile, target);
    console.log(`Installed to ${target}`);
  } else {
    console.log('Install: Archipelago Launcher -> "Install APWorld", or pass --install');
  }
}

main();
