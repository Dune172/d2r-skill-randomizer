import fs from 'fs';
import path from 'path';
import type { ClassName } from './classes';

// One directory above the project so deployments (fresh clone/pull) can't wipe it.
// Override by setting LEADERBOARD_FILE to any absolute path on the server.
const LEADERBOARD_FILE =
  process.env.LEADERBOARD_FILE || path.join(process.cwd(), '..', 'leaderboard.json');

export type Difficulty = 'normal' | 'hell';

export type Submission = {
  id: string;
  weekNumber: number;
  name: string;
  className: ClassName;
  timeSeconds: number;
  proofUrl: string;
  submittedAt: number;
  ip: string;
};

export type LeaderboardFile = {
  byWeek: Record<string, Submission[]>; // normal board
  byWeekHell?: Record<string, Submission[]>; // hell board (lazily created)
};

/**
 * Returns the per-week bucket for the given difficulty, creating the hell bucket
 * on first use. 'normal' stays on `byWeek` for backward-compat with existing files.
 */
function bucket(data: LeaderboardFile, difficulty: Difficulty): Record<string, Submission[]> {
  if (difficulty === 'hell') {
    return (data.byWeekHell ??= {});
  }
  return data.byWeek;
}

export type PublicSubmission = Omit<Submission, 'ip'>;

let writeLock: Promise<void> = Promise.resolve();

const CACHE_TTL_MS = 5_000;
let cached: { value: LeaderboardFile | null; stamp: number } = { value: null, stamp: 0 };

function emptyFile(): LeaderboardFile {
  return { byWeek: {} };
}

function readFromDisk(): LeaderboardFile {
  try {
    const raw = fs.readFileSync(LEADERBOARD_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.byWeek && typeof parsed.byWeek === 'object') {
      return parsed as LeaderboardFile;
    }
    return emptyFile();
  } catch {
    return emptyFile();
  }
}

function readCached(): LeaderboardFile {
  const now = Date.now();
  if (cached.value && now - cached.stamp < CACHE_TTL_MS) {
    return cached.value;
  }
  const fresh = readFromDisk();
  cached = { value: fresh, stamp: now };
  return fresh;
}

function writeToDisk(data: LeaderboardFile): void {
  fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(data), 'utf-8');
  cached = { value: data, stamp: Date.now() };
}

function sortEntries(entries: Submission[]): Submission[] {
  return entries.slice().sort((a, b) => {
    if (a.timeSeconds !== b.timeSeconds) return a.timeSeconds - b.timeSeconds;
    return a.submittedAt - b.submittedAt;
  });
}

export function stripIp(s: Submission): PublicSubmission {
  // Never leak submitter IPs to clients.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { ip: _ip, ...rest } = s;
  return rest;
}

/** Sorted ascending by time, then by submittedAt. IPs not stripped — caller's job. */
export function getEntries(weekNumber: number, difficulty: Difficulty = 'normal'): Submission[] {
  const data = readCached();
  const list = bucket(data, difficulty)[String(weekNumber)] ?? [];
  return sortEntries(list);
}

/**
 * Returns the most recent submission from this IP in the given week whose name
 * is different from `excludeName` (case-insensitive). Used to enforce the
 * once-per-hour-per-IP cooldown without blocking same-name updates.
 */
export function lastOtherSubmissionFromIp(
  ip: string,
  weekNumber: number,
  excludeName: string,
  difficulty: Difficulty = 'normal',
): Submission | null {
  const data = readCached();
  const list = bucket(data, difficulty)[String(weekNumber)] ?? [];
  const lower = excludeName.toLowerCase();
  let latest: Submission | null = null;
  for (const e of list) {
    if (e.ip !== ip) continue;
    if (e.name.toLowerCase() === lower) continue;
    if (!latest || e.submittedAt > latest.submittedAt) latest = e;
  }
  return latest;
}

export type AddResult = { status: 'added' | 'updated' | 'unchanged'; rank: number };

/**
 * Per-(week, IP, lowercased-name) dedupe: replaces a prior entry only if the new
 * time is strictly faster. Otherwise returns 'unchanged' and leaves disk alone.
 */
export async function addOrReplace(
  sub: Submission,
  difficulty: Difficulty = 'normal',
): Promise<AddResult> {
  let result: AddResult = { status: 'added', rank: 0 };

  const next = writeLock.then(() => {
    const data = readFromDisk();
    const board = bucket(data, difficulty);
    const key = String(sub.weekNumber);
    const list = board[key] ?? [];

    const lowerName = sub.name.toLowerCase();
    const existingIdx = list.findIndex(
      (e) => e.ip === sub.ip && e.name.toLowerCase() === lowerName,
    );

    if (existingIdx >= 0) {
      const existing = list[existingIdx];
      if (sub.timeSeconds >= existing.timeSeconds) {
        const sorted = sortEntries(list);
        const rank = sorted.findIndex((e) => e.id === existing.id) + 1;
        result = { status: 'unchanged', rank };
        return;
      }
      list[existingIdx] = { ...sub, id: existing.id };
    } else {
      list.push(sub);
    }

    board[key] = list;
    writeToDisk(data);

    const sorted = sortEntries(list);
    const finalId = existingIdx >= 0 ? list[existingIdx].id : sub.id;
    const rank = sorted.findIndex((e) => e.id === finalId) + 1;
    result = { status: existingIdx >= 0 ? 'updated' : 'added', rank };
  });

  writeLock = next.catch(() => {});
  await next;
  return result;
}

export async function deleteById(id: string): Promise<boolean> {
  let deleted = false;

  const next = writeLock.then(() => {
    const data = readFromDisk();
    let changed = false;
    const boards = [data.byWeek, data.byWeekHell].filter(Boolean) as Record<string, Submission[]>[];
    for (const board of boards) {
      for (const week of Object.keys(board)) {
        const before = board[week].length;
        board[week] = board[week].filter((e) => e.id !== id);
        if (board[week].length !== before) changed = true;
      }
    }
    if (changed) {
      writeToDisk(data);
      deleted = true;
    }
  });

  writeLock = next.catch(() => {});
  await next;
  return deleted;
}
