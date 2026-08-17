/**
 * set-counter.mjs
 *
 * Set the all-time "mods generated" total, for recovering after the counter
 * file is lost. Writes through the same durable path the app uses: temp file →
 * fsync → atomic rename, then mirrors to counter.json.bak, so the value is
 * immediately protected rather than waiting for the app's next write.
 *
 * Prefer this over `echo '{"count":N}' > counter.json`, which leaves no backup
 * and can be truncated by a concurrent reader.
 *
 * Resolves the same path the app does: $COUNTER_FILE, else ../counter.json
 * relative to the repo root. On the VPS the app is started by PM2 with
 * COUNTER_FILE=/var/www/counter.json, so run this with the same value set, or
 * pass --file explicitly.
 *
 * Usage:
 *   COUNTER_FILE=/var/www/counter.json node scripts/set-counter.mjs 5679
 *   node scripts/set-counter.mjs 5679 --file /var/www/counter.json
 *   node scripts/set-counter.mjs --show
 *
 * The app caches the total for 5s, so /api/health can lag briefly.
 * Exits 1 on bad input or an unwritable target.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const args = process.argv.slice(2);
const fileFlag = args.indexOf('--file');
const target = fileFlag !== -1
  ? args[fileFlag + 1]
  : process.env.COUNTER_FILE || path.join(ROOT, '..', 'counter.json');

if (fileFlag !== -1 && !target) {
  console.error('--file needs a path');
  process.exit(1);
}

const backup = `${target}.bak`;

function read(file) {
  try {
    const count = JSON.parse(fs.readFileSync(file, 'utf-8')).count;
    return typeof count === 'number' && Number.isFinite(count) && count >= 0 ? count : `unreadable`;
  } catch (err) {
    return err.code === 'ENOENT' ? 'missing' : 'unreadable';
  }
}

function report() {
  console.log(`file:   ${target}\n  primary: ${read(target)}\n  backup:  ${read(backup)}`);
}

const positional = args.filter((a, i) => !a.startsWith('--') && i !== fileFlag + 1);

if (args.includes('--show') || positional.length === 0) {
  report();
  if (positional.length === 0 && !args.includes('--show')) {
    console.error('\nNothing written. Pass a number to set the total, e.g. node scripts/set-counter.mjs 5679');
    process.exit(1);
  }
  process.exit(0);
}

const count = Number(positional[0]);
if (!Number.isInteger(count) || count < 0) {
  console.error(`Not a valid total: ${positional[0]}`);
  process.exit(1);
}

const before = read(target);
if (typeof before === 'number' && count < before) {
  console.warn(`WARNING: ${count} is lower than the current total (${before}). The counter only ever counts up.`);
}

const tmp = `${target}.tmp`;
try {
  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeFileSync(fd, JSON.stringify({ count }), 'utf-8');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, target);
  fs.copyFileSync(target, backup);
} catch (err) {
  console.error(`Failed to write ${target}: ${err.message}`);
  if (err.code === 'EACCES') {
    console.error('Permission denied — run as the same user the app runs as (often root on the VPS).');
  }
  try { fs.unlinkSync(tmp); } catch { /* nothing to clean up */ }
  process.exit(1);
}

console.log(`Set total to ${count.toLocaleString('en-US')} (was ${before}).`);
report();
console.log('\nConfirm with: curl -s https://d2rrandomizer.com/api/health');
