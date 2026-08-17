import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Where the app's persistent state lives: counter.json, leaderboard.json,
 * traffic-stats.json, weekly-announce.json and the zip-cache directory.
 *
 * These all used to resolve as `process.cwd()/..` independently. That works on a
 * fixed deploy path (a VPS checkout at /var/www/d2rrandomizer resolves to
 * /var/www), but it silently breaks on any host that runs each release from its
 * own build directory — cwd changes per deploy, so `..` points somewhere new and
 * the app quietly starts from zero against empty files while the real state sits
 * orphaned in the old location. Nothing errors; the totals just reset.
 *
 * Resolution order:
 *   1. STATE_DIR, when set — always wins, no guessing.
 *   2. `cwd/..`, if it already holds state. Preserves the VPS layout exactly.
 *   3. The account's home directory, if it already holds state. This is the
 *      managed-hosting case (Hostinger runs each build from its own directory
 *      under /hbuilds, but the account home is stable).
 *   4. Otherwise `cwd/..`, matching the historical default for a fresh install.
 *
 * Steps 2 and 3 only ever *adopt* a directory that already contains state — the
 * app never invents a new location, so a genuinely fresh install still behaves
 * as it always did.
 */

/** Any one of these marks a directory as the real state directory. */
const STATE_MARKERS = ['counter.json', 'leaderboard.json', 'traffic-stats.json'];

function holdsState(dir: string): boolean {
  return STATE_MARKERS.some(name => {
    try {
      return fs.existsSync(path.join(dir, name));
    } catch {
      return false;
    }
  });
}

function homeDir(): string | null {
  try {
    const home = os.homedir();
    return home && home !== '/' ? home : null;
  } catch {
    return null;
  }
}

function resolve(): { dir: string; how: string } {
  if (process.env.STATE_DIR) {
    return { dir: process.env.STATE_DIR, how: 'STATE_DIR' };
  }

  const beside = path.resolve(process.cwd(), '..');
  if (holdsState(beside)) {
    return { dir: beside, how: 'cwd/..' };
  }

  const home = homeDir();
  if (home && holdsState(home)) {
    return { dir: home, how: `home dir of ${os.userInfo?.().username ?? 'process user'}` };
  }

  return { dir: beside, how: 'cwd/.. — no existing state found, starting fresh' };
}

const resolved = resolve();

export const STATE_DIR = resolved.dir;

export function statePath(name: string): string {
  return path.join(STATE_DIR, name);
}

/**
 * One-line startup breadcrumb. Without it, a wrong state directory is invisible:
 * the app reports 0 and starts counting up while the real data is untouched
 * somewhere else.
 */
export function describeStateDir(): string {
  return `${STATE_DIR} (via ${resolved.how})`;
}
