/**
 * dev-cold-cache.mjs — run the dev server against throwaway state.
 *
 * The zip cache is keyed by seed and options, not by the code that built the zip, so a
 * dev server on the normal state directory happily serves mods built before your change.
 * That makes any "did the output change?" check pass without running the new code. This
 * starts `next dev` with an empty STATE_DIR and ZIP_CACHE_DIR in the OS temp folder, so
 * every request is a real generation, and the real counters and caches are never touched.
 *
 *   node scripts/dev-cold-cache.mjs            # http://localhost:3210
 *   PORT=3300 node scripts/dev-cold-cache.mjs
 */
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const port = process.env.PORT || '3210';
const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'd2rr-cold-'));

console.log(`cold state dir: ${stateDir}`);

const child = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'dev', '-p', port], {
  cwd: path.resolve(import.meta.dirname, '..'),
  stdio: 'inherit',
  env: {
    ...process.env,
    STATE_DIR: stateDir,
    ZIP_CACHE_DIR: path.join(stateDir, 'zip-cache'),
    // A scratch server must never post to the real channels.
    DISCORD_WEBHOOK_URL: '',
    DISCORD_WEEKLY_WEBHOOK_URL: '',
  },
});

const stop = () => child.kill();
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
child.on('exit', code => {
  fs.rmSync(stateDir, { recursive: true, force: true });
  process.exit(code ?? 0);
});
