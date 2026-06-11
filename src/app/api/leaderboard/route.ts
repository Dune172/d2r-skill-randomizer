import { NextRequest, NextResponse } from 'next/server';
import {
  addOrReplace,
  getEntries,
  lastOtherSubmissionFromIp,
  stripIp,
  type Submission,
} from '@/lib/leaderboard';
import { isClean } from '@/lib/profanity';
import { MAX_RUN_SECONDS, MIN_RUN_SECONDS, parseHMS } from '@/lib/time-format';
import { isSpecificVideoUrl, VIDEO_HOSTS_LABEL } from '@/lib/video-host';
import { isClassName } from '@/lib/classes';
import { notifyNewRun } from '@/lib/discord-webhook';
import { getCurrentWeekNumber } from '@/lib/challenge/week';
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const NAME_RE = /^[\w\s.\-']+$/u;

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const weekParam = url.searchParams.get('week');
  const weekNumber = weekParam ? Number(weekParam) : getCurrentWeekNumber();
  if (!Number.isFinite(weekNumber) || weekNumber < 1) {
    return bad('Invalid week.');
  }

  const entries = getEntries(weekNumber).map(stripIp);
  return NextResponse.json(
    { weekNumber, entries },
    // Open CORS: public read-only data; lets the marketing dashboard poll it.
    { headers: { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' } },
  );
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const rl = checkRateLimit(`leaderboard:${ip}`, 5, 60_000);
  if (!rl.ok) {
    return rateLimitResponse(rl.retryAfter);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return bad('Invalid JSON body.');
  }

  if (!body || typeof body !== 'object') return bad('Missing body.');
  const b = body as Record<string, unknown>;

  const weekNumber = Number(b.weekNumber);
  if (!Number.isFinite(weekNumber) || weekNumber < 1) {
    return bad('Invalid weekNumber.');
  }
  const currentWeek = getCurrentWeekNumber();
  if (weekNumber !== currentWeek) {
    return bad('Submissions for that week are closed.');
  }

  const rawName = typeof b.name === 'string' ? b.name.trim() : '';
  if (rawName.length < 2 || rawName.length > 20) {
    return bad('Name must be 2–20 characters.');
  }
  if (!NAME_RE.test(rawName)) {
    return bad('Name can only contain letters, numbers, spaces, dot, dash, apostrophe.');
  }
  // Reject "aaaa", "....", "1111" — needs at least 2 distinct non-space chars.
  const distinct = new Set(rawName.toLowerCase().replace(/\s/g, '').split(''));
  if (distinct.size < 2) {
    return bad('Name needs more variety.');
  }
  if (!isClean(rawName)) {
    return bad('Please choose a different name.');
  }

  const className = b.className;
  if (!isClassName(className)) {
    return bad('Pick a class.');
  }

  const totalSeconds = parseHMS({
    h: typeof b.hours === 'number' || typeof b.hours === 'string' ? b.hours : 0,
    m: typeof b.minutes === 'number' || typeof b.minutes === 'string' ? b.minutes : 0,
    s: typeof b.seconds === 'number' || typeof b.seconds === 'string' ? b.seconds : 0,
  });
  if (totalSeconds < MIN_RUN_SECONDS) {
    return bad('Time must be at least 30 minutes — Baal Normal can’t be cleared faster than that.');
  }
  if (totalSeconds > MAX_RUN_SECONDS) {
    return bad('Time must be under 7 days.');
  }

  const proofUrl = typeof b.proofUrl === 'string' ? b.proofUrl.trim() : '';
  if (proofUrl.length < 8 || proofUrl.length > 300) {
    return bad('Video link is required (8–300 characters).');
  }
  if (!isSpecificVideoUrl(proofUrl)) {
    return bad(`Video link must point to a specific video on ${VIDEO_HOSTS_LABEL}.`);
  }

  // Per-IP cooldown: at most one submission per IP per hour, EXCEPT for updates
  // to the submitter's own existing entry (same name, same IP).
  const HOUR_MS = 60 * 60 * 1000;
  const recent = lastOtherSubmissionFromIp(ip, weekNumber, rawName);
  if (recent && Date.now() - recent.submittedAt < HOUR_MS) {
    const minsLeft = Math.ceil((HOUR_MS - (Date.now() - recent.submittedAt)) / 60_000);
    return NextResponse.json(
      { error: 'Try again later.' },
      { status: 429, headers: { 'Retry-After': String(minsLeft * 60) } },
    );
  }

  const submission: Submission = {
    id:
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2) + Date.now().toString(36),
    weekNumber,
    name: rawName,
    className,
    timeSeconds: totalSeconds,
    proofUrl,
    submittedAt: Date.now(),
    ip,
  };

  const result = await addOrReplace(submission);
  if (result.status === 'added' || result.status === 'updated') {
    await notifyNewRun(submission, { status: result.status, rank: result.rank });
  }
  return NextResponse.json(result);
}
