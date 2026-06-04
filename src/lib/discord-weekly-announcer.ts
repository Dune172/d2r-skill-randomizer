/**
 * Mutation challenge Discord announcement — fires every other Monday at 09:00 LA into
 * the DISCORD_WEEKLY_WEBHOOK_URL channel. Posts the challenge's theme name, the
 * active mutations with one-line descriptions, plus the gold OG card PNG attached.
 *
 * Persists `lastAnnouncedWeek` to a JSON file next to counter.json so we don't
 * double-post on restart and so a server reboot across the challenge boundary
 * still catches up.
 *
 * Best-effort: HTTP and disk errors are logged but never thrown.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  getCurrentWeekNumber,
  getWeekStart,
} from './challenge/week';
import { getActiveMutations, getWeekName, type MutationDef } from './mutations/registry';
import { renderChallengeCardPng } from './og/challengeCard';

const POST_HOUR_LA = 9;
const POST_HOUR_OFFSET_MS = POST_HOUR_LA * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 15_000;
const STATE_PATH = path.join(process.cwd(), '..', 'weekly-announce.json');

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
 * Post the weekly announcement for the given week. No-op if DISCORD_WEEKLY_WEBHOOK_URL
 * is unset. Throws on unexpected programmer errors but swallows webhook/network errors.
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

function nextFireTime(currentWeek: number, now: number): number {
  const currentFire = getWeekStart(currentWeek).getTime() + POST_HOUR_OFFSET_MS;
  if (now < currentFire) return currentFire;
  return getWeekStart(currentWeek + 1).getTime() + POST_HOUR_OFFSET_MS;
}

async function fireAndReschedule(): Promise<void> {
  const week = getCurrentWeekNumber();
  const ok = await postWeeklyAnnouncement(week);
  if (ok) {
    await writeState({ lastAnnouncedWeek: week });
  }
  scheduleNext();
}

let scheduledTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleNext(): void {
  if (scheduledTimer) clearTimeout(scheduledTimer);
  const now = Date.now();
  const week = getCurrentWeekNumber();
  const fireAt = nextFireTime(week, now);
  const delay = Math.max(0, fireAt - now);
  scheduledTimer = setTimeout(() => {
    fireAndReschedule().catch((err) => {
      const reason = err instanceof Error ? err.message : String(err);
      console.warn(`[weekly-announcer] tick failed: ${reason}`);
      scheduleNext();
    });
  }, delay);
  scheduledTimer.unref?.();
  const fireDate = new Date(fireAt).toISOString();
  console.log(`[weekly-announcer] next post scheduled for ${fireDate} (in ${Math.round(delay / 1000)}s)`);
}

/** Boot-time entry: catch up if needed, then schedule the next Monday post. */
export function startWeeklyAnnouncer(): void {
  if (!process.env.DISCORD_WEEKLY_WEBHOOK_URL) {
    console.log('[weekly-announcer] DISCORD_WEEKLY_WEBHOOK_URL unset, scheduler disabled');
    return;
  }
  void (async () => {
    try {
      const state = await readState();
      const now = Date.now();
      const week = getCurrentWeekNumber();
      const currentFire = getWeekStart(week).getTime() + POST_HOUR_OFFSET_MS;
      if (now >= currentFire && state.lastAnnouncedWeek < week) {
        console.log(`[weekly-announcer] catch-up post for Week ${week}`);
        const ok = await postWeeklyAnnouncement(week);
        if (ok) await writeState({ lastAnnouncedWeek: week });
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.warn(`[weekly-announcer] boot catch-up failed: ${reason}`);
    } finally {
      scheduleNext();
    }
  })();
}
