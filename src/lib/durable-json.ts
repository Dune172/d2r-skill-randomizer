import fs from 'fs';

/**
 * Crash-safe JSON persistence for the app's file-backed counters.
 *
 * Both callers (counter.ts, traffic-stats.ts) used to do `readFileSync` in a
 * try/catch that returned an empty value on ANY failure, then `writeFileSync`
 * the new state back. That pairing silently destroys data: writeFileSync
 * truncates before it writes, so killing the process mid-write — which is
 * exactly what `pm2 reload` does on deploy, while /api/randomize and /api/hit
 * are still serving — leaves a zero-length file. The next read then can't tell
 * "corrupt" from "nothing recorded yet", starts from empty, and overwrites the
 * real history. That is how the mod counter went from ~5,700 to 1.
 *
 * The fix is the standard durable-write pair:
 *   - write to a temp file, fsync it, then rename over the target. Rename is
 *     atomic within a filesystem, so a reader never sees a partial file and a
 *     crash mid-write leaves the previous contents intact.
 *   - mirror each success to a .bak, and distinguish a missing file (a genuine
 *     empty state) from an unreadable one (unknown — fall back, never assume
 *     empty).
 *
 * Single-writer only, matching the app's `instances: 1` deployment.
 */

export type JsonRead<T> =
  /** File parsed cleanly. */
  | { status: 'ok'; value: T }
  /** File does not exist — a genuine "nothing recorded yet". */
  | { status: 'missing' }
  /** File exists but could not be read or parsed. Never treat as empty. */
  | { status: 'unreadable' };

export function readJson<T>(file: string, isValid: (v: unknown) => v is T): JsonRead<T> {
  let raw: string;
  try {
    raw = fs.readFileSync(file, 'utf-8');
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'ENOENT'
      ? { status: 'missing' }
      : { status: 'unreadable' };
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return isValid(parsed) ? { status: 'ok', value: parsed } : { status: 'unreadable' };
  } catch {
    return { status: 'unreadable' };
  }
}

/**
 * Read `file`, falling back to `file.bak` when the primary is unreadable.
 *
 * `preferBackup` additionally lets a caller take the backup when the primary
 * parsed but looks degenerate (e.g. reset to an empty object by an older
 * build). It is only consulted when both copies are readable.
 */
export function readJsonWithBackup<T>(
  file: string,
  isValid: (v: unknown) => v is T,
  preferBackup?: (primary: T, backup: T) => boolean,
): JsonRead<T> {
  const primary = readJson(file, isValid);
  const backup = readJson(backupPath(file), isValid);

  if (primary.status === 'ok') {
    if (backup.status === 'ok' && preferBackup?.(primary.value, backup.value)) {
      console.warn(`[durable-json] ${file} looks degenerate; using ${backupPath(file)}`);
      return backup;
    }
    return primary;
  }

  if (primary.status === 'unreadable' && backup.status === 'ok') {
    console.warn(`[durable-json] ${file} unreadable; recovered from ${backupPath(file)}`);
    return backup;
  }

  // A missing primary with a healthy backup means the primary was deleted or a
  // rename was lost. Prefer real data over assuming a fresh install.
  if (primary.status === 'missing' && backup.status === 'ok') {
    console.warn(`[durable-json] ${file} missing; recovered from ${backupPath(file)}`);
    return backup;
  }

  return primary;
}

export function backupPath(file: string): string {
  return `${file}.bak`;
}

/**
 * Replace `file` atomically, then mirror it to `file.bak`.
 * Throws if the primary write fails; a failed backup copy is non-fatal.
 */
export function writeJsonDurable(file: string, data: unknown): void {
  const tmp = `${file}.tmp`;
  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeFileSync(fd, JSON.stringify(data), 'utf-8');
    // Flush before the rename so a machine-level crash can't leave the renamed
    // file pointing at unwritten blocks.
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, file);
  try {
    fs.copyFileSync(file, backupPath(file));
  } catch {
    // A stale backup only costs recoverability, never correctness.
  }
}
