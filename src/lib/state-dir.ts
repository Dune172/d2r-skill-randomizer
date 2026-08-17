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
 * Set STATE_DIR to an absolute path on persistent storage and every store
 * follows it. The per-file env vars still win where they're set, so existing
 * deployments keep working unchanged.
 */
export const STATE_DIR = process.env.STATE_DIR || path.join(process.cwd(), '..');

export function statePath(name: string): string {
  return path.join(STATE_DIR, name);
}

/**
 * One-line startup breadcrumb. Without it, a wrong STATE_DIR is invisible:
 * the app reports 0 and starts counting up while the real data is untouched
 * somewhere else.
 */
export function describeStateDir(): string {
  return process.env.STATE_DIR
    ? `STATE_DIR=${STATE_DIR}`
    : `${STATE_DIR} (STATE_DIR unset; derived from cwd ${process.cwd()})`;
}
