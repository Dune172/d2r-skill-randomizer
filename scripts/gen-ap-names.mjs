/**
 * gen-ap-names.mjs: write the item and check list the Archipelago player file builder shows.
 *
 * The list comes from the client's id tables (tools/ap-client/cmd/namedump), whose names
 * scripts/verify-ap-ids.mjs proves equal to the apworld's. --check fails when the
 * committed file is out of date instead of writing it.
 *
 *   node scripts/gen-ap-names.mjs [--check]
 */
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const out = path.join(repoRoot, 'src', 'lib', 'archipelago', 'ap-names.json');
const text = execFileSync('go', ['run', './cmd/namedump'], {
  cwd: path.join(repoRoot, 'tools', 'ap-client'), encoding: 'utf8', maxBuffer: 16 << 20,
}).replace(/\r\n/g, '\n');

if (process.argv.includes('--check')) {
  const current = fs.existsSync(out) ? fs.readFileSync(out, 'utf8').replace(/\r\n/g, '\n') : '';
  if (current !== text) {
    console.error(`${path.relative(repoRoot, out)} is out of date. Run: node scripts/gen-ap-names.mjs`);
    process.exit(1);
  }
  console.log(`${path.relative(repoRoot, out)} is up to date.`);
} else {
  fs.writeFileSync(out, text);
  console.log(`wrote ${path.relative(repoRoot, out)}`);
}
