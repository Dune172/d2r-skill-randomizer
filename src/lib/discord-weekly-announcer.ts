/**
 * Mutation challenge Discord announcement — fires every other Monday at 09:00 LA into
 * the DISCORD_WEEKLY_WEBHOOK_URL channel. Posts the challenge's theme name, the
 * active mutations with one-line descriptions, plus the gold OG card PNG attached.
 *
 * Posting exactly once per challenge takes two separate guards, because more than
 * one announcer can be live for a single Monday:
 *
 *   - Within a process. Next.js can instantiate the same module twice when it is
 *     reached through different resolution paths (the hazard warmup.ts works
 *     around with globalThis), and instrumentation's `register()` is not
 *     guaranteed to run only once. Two module copies each held their own timer
 *     on the same webhook, so the scheduler handle now lives on globalThis and a
 *     second start is a no-op.
 *
 *   - Across processes. A PM2 restart or an overlapping deploy can leave two
 *     servers straddling 09:00. Before posting, the week is claimed by
 *     exclusively creating `<state file>.week-<n>.lock`; whoever loses that
 *     create skips. `lastAnnouncedWeek` in weekly-announce.json then records the
 *     win so a later boot catch-up stays quiet too — that file used to gate only
 *     the catch-up path, leaving the scheduled post free to duplicate it.
 *
 * Best-effort: HTTP and disk errors are logged but never thrown.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { statePath } from './state-dir';
import {
  getCurrentWeekNumber,
  getWeekStart,
} from './challenge/week';
import { getActiveMutations, getWeekName, type MutationDef } from './mutations/registry';
import { renderChallengeCardPng } from './og/challengeCard';

const POST_HOUR_LA = 9;
const POST_HOUR_OFFSET_MS = POST_HOUR_LA * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 15_000;
// Lives in STATE_DIR (see state-dir.ts) so it survives deploys. Losing this
// makes the announcer re-post the current week to Discord after a deploy.
const STATE_PATH = process.env.WEEKLY_ANNOUNCE_FILE || statePath('weekly-announce.json');
// A claim older than this belonged to a process that died mid-post: a post that
// actually landed advances lastAnnouncedWeek, which is checked first, so a stale
// claim can only mean the poster never finished.
const CLAIM_STALE_MS = 10 * 60 * 1000;

interface AnnouncerState {
  lastAnnouncedWeek: number;
}

async function readState(): Promise<AnnouncerState> {
  try {
    const raw = await fs.readFile(STATE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Partial<AnnouncerState>;
    const last = typeof parsed.lastAnnouncedWeek === 'number' ? parsed.lastAnnouncedWeek : 0;
    return { lastAnnouncedWeek: last };
  } catch {
    return { lastAnnouncedWeek: 0 };
  }
}

async function writeState(state: AnnouncerState): Promise<void> {
  try {
    await fs.writeFile(STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.warn(`[weekly-announcer] failed to persist state: ${reason}`);
  }
}

function claimPath(week: number): string {
  return `${STATE_PATH}.week-${week}.lock`;
}

/** Age of an existing claim in ms, or null if it can't be read. */
async function claimAgeMs(week: number): Promise<number | null> {
  try {
    const st = await fs.stat(claimPath(week));
    return Date.now() - st.mtimeMs;
  } catch {
    return null;
  }
}

async function releaseClaim(week: number): Promise<void> {
  try {
    await fs.unlink(claimPath(week));
  } catch {
    // Already gone, or never written. Nothing to undo.
  }
}

/** Drop lock files for challenges older than `week` so STATE_DIR doesn't collect them. */
async function prunePriorClaims(week: number): Promise<void> {
  const dir = path.dirname(STATE_PATH);
  const prefix = `${path.basename(STATE_PATH)}.week-`;
  const suffix = '.lock';
  try {
    const names = await fs.readdir(dir);
    await Promise.all(
      names.map(async (name) => {
        if (!name.startsWith(prefix) || !name.endsWith(suffix)) return;
        const n = Number.parseInt(name.slice(prefix.length, name.length - suffix.length), 10);
        if (!Number.isFinite(n) || n >= week) return;
        try {
          await fs.unlink(path.join(dir, name));
        } catch {
          // Raced with another instance's prune. Harmless.
        }
      }),
    );
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.warn(`[weekly-announcer] failed to prune old claims: ${reason}`);
  }
}

/**
 * Reserve the right to announce `week`, returning false if it's already been
 * announced or another instance is posting it right now. The reservation is the
 * exclusive create of the claim file — the one filesystem primitive that is
 * atomic across processes, so two servers can't both come out of here true.
 */
async function tryClaimWeek(week: number, allowSteal = true): Promise<boolean> {
  const state = await readState();
  if (state.lastAnnouncedWeek >= week) return false;

  try {
    await fs.writeFile(
      claimPath(week),
      JSON.stringify({ week, claimedAt: new Date().toISOString(), pid: process.pid }),
      { flag: 'wx' },
    );
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') {
      // The filesystem can't coordinate for us. Announcing once and risking a
      // duplicate beats dropping the challenge announcement entirely.
      const reason = err instanceof Error ? err.message : String(err);
      console.warn(`[weekly-announcer] could not write claim file, posting unguarded: ${reason}`);
      return true;
    }
  }

  const age = await claimAgeMs(week);
  if (allowSteal && age !== null && age > CLAIM_STALE_MS) {
    console.warn(`[weekly-announcer] taking over stale claim for Challenge ${week}`);
    await releaseClaim(week);
    return tryClaimWeek(week, false);
  }
  return false;
}

function firstSentence(description: string): string {
  const idx = description.indexOf('.');
  if (idx === -1) return description.trim();
  return description.slice(0, idx + 1).trim();
}

function formatMessage(weekNumber: number, weekName: string, mutations: MutationDef[]): string {
  return [
    `**Challenge ${weekNumber} — ${weekName}**`,
    '',
    ...mutations.map((m) => `${m.name} — ${firstSentence(m.description)}`),
  ].join('\n');
}

/**
 * Post the weekly announcement for the given week, unconditionally. No-op if
 * DISCORD_WEEKLY_WEBHOOK_URL is unset. Throws on unexpected programmer errors but
 * swallows webhook/network errors.
 *
 * This is the raw sender with no duplicate guard — it exists for the admin
 * re-post route. Automatic callers must go through announceWeekOnce().
 */
export async function postWeeklyAnnouncement(weekNumber: number): Promise<boolean> {
  const url = process.env.DISCORD_WEEKLY_WEBHOOK_URL;
  if (!url) {
    console.warn('[weekly-announcer] DISCORD_WEEKLY_WEBHOOK_URL unset, skipping');
    return false;
  }

  const weekName = getWeekName(weekNumber);
  const mutations = getActiveMutations(weekNumber);
  const content = formatMessage(weekNumber, weekName, mutations);

  let png: Buffer;
  try {
    png = await renderChallengeCardPng(weekNumber);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.warn(`[weekly-announcer] failed to render card image: ${reason}`);
    return false;
  }

  const form = new FormData();
  form.set(
    'payload_json',
    JSON.stringify({ username: 'D2R Randomizer', content }),
  );
  form.set(
    'files[0]',
    new Blob([new Uint8Array(png)], { type: 'image/png' }),
    'mutation-challenge.png',
  );

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      body: form,
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn(`[weekly-announcer] HTTP ${res.status}: ${body.slice(0, 300)}`);
      return false;
    }
    console.log(`[weekly-announcer] posted Challenge ${weekNumber} (${weekName})`);
    return true;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.warn(`[weekly-announcer] fetch failed: ${reason}`);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Announce `week` if nobody else already has. Both automatic paths — the Monday
 * timer and the boot catch-up — funnel through here, so the guard covers a
 * restart landing on top of a scheduled fire as well as two servers overlapping.
 */
export async function announceWeekOnce(week: number, reason: string): Promise<boolean> {
  if (!(await tryClaimWeek(week))) {
    console.log(`[weekly-announcer] Challenge ${week} already announced, skipping ${reason}`);
    return false;
  }

  const ok = await postWeeklyAnnouncement(week);
  if (ok) {
    await writeState({ lastAnnouncedWeek: week });
    await prunePriorClaims(week);
  } else {
    // Hand the week back so a later boot catch-up can retry it.
    await releaseClaim(week);
  }
  return ok;
}

function nextFireTime(currentWeek: number, now: number): number {
  const currentFire = getWeekStart(currentWeek).getTime() + POST_HOUR_OFFSET_MS;
  if (now < currentFire) return currentFire;
  return getWeekStart(currentWeek + 1).getTime() + POST_HOUR_OFFSET_MS;
}

async function fireAndReschedule(): Promise<void> {
  try {
    await announceWeekOnce(getCurrentWeekNumber(), 'scheduled post');
  } finally {
    scheduleNext();
  }
}

// The scheduler handle is process-wide rather than module-scoped: Next.js can
// load this module more than once in a single process, and two module copies
// each holding their own timer is one of the ways the Monday post got doubled.
const SCHEDULER_KEY = '__d2r_weekly_announcer__';
type SchedulerState = { started: boolean; timer: ReturnType<typeof setTimeout> | null };

function schedulerState(): SchedulerState {
  const g = globalThis as Record<string, unknown>;
  if (!g[SCHEDULER_KEY]) g[SCHEDULER_KEY] = { started: false, timer: null } as SchedulerState;
  return g[SCHEDULER_KEY] as SchedulerState;
}

function scheduleNext(): void {
  const sched = schedulerState();
  if (sched.timer) clearTimeout(sched.timer);
  const now = Date.now();
  const week = getCurrentWeekNumber();
  const fireAt = nextFireTime(week, now);
  const delay = Math.max(0, fireAt - now);
  const timer = setTimeout(() => {
    fireAndReschedule().catch((err) => {
      const reason = err instanceof Error ? err.message : String(err);
      console.warn(`[weekly-announcer] tick failed: ${reason}`);
    });
  }, delay);
  timer.unref?.();
  sched.timer = timer;
  const fireDate = new Date(fireAt).toISOString();
  console.log(`[weekly-announcer] next post scheduled for ${fireDate} (in ${Math.round(delay / 1000)}s)`);
}

/** Boot-time entry: catch up if needed, then schedule the next Monday post. */
export function startWeeklyAnnouncer(): void {
  if (!process.env.DISCORD_WEEKLY_WEBHOOK_URL) {
    console.log('[weekly-announcer] DISCORD_WEEKLY_WEBHOOK_URL unset, scheduler disabled');
    return;
  }
  const sched = schedulerState();
  if (sched.started) {
    console.log('[weekly-announcer] scheduler already running in this process, ignoring duplicate start');
    return;
  }
  sched.started = true;

  void (async () => {
    try {
      const now = Date.now();
      const week = getCurrentWeekNumber();
      const currentFire = getWeekStart(week).getTime() + POST_HOUR_OFFSET_MS;
      if (now >= currentFire) {
        await announceWeekOnce(week, 'boot catch-up');
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.warn(`[weekly-announcer] boot catch-up failed: ${reason}`);
    } finally {
      scheduleNext();
    }
  })();
}
