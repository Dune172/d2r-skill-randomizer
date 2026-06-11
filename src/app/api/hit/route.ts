import { NextRequest, NextResponse } from 'next/server';
import { recordHit } from '@/lib/traffic-stats';
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

// Session-start beacon for first-party attribution (see src/lib/traffic-stats.ts).
// Fired once per browser session from the inline script in layout.tsx via
// navigator.sendBeacon. Stores aggregates only — the client IP is used for
// rate limiting and then discarded, never written to disk.

const SAFE_TOKEN = /[^a-z0-9_-]/g;

function sanitizeToken(value: unknown, max = 32): string {
  if (typeof value !== 'string') return '';
  return value.toLowerCase().replace(SAFE_TOKEN, '').slice(0, max);
}

function sanitizePath(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/')) return '/';
  // Strip query/fragment; collapse anything odd.
  const clean = value.split(/[?#]/)[0].replace(/[^\w\-/.]/g, '').slice(0, 64);
  return clean || '/';
}

function referrerHost(value: unknown): string {
  if (typeof value !== 'string' || value === '') return '';
  try {
    const host = new URL(value).hostname.toLowerCase();
    // Ignore self-referrals (internal navigation).
    if (host === 'd2rrandomizer.com' || host.endsWith('.d2rrandomizer.com')) return '';
    return host.slice(0, 64);
  } catch {
    return '';
  }
}

export async function POST(request: NextRequest) {
  const limit = checkRateLimit(`hit:${getClientIp(request)}`, 30, 60_000);
  if (!limit.ok) return rateLimitResponse(limit.retryAfter);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body.' }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;

  recordHit({
    source: sanitizeToken(b.utm_source),
    referrerHost: referrerHost(b.ref),
    pathname: sanitizePath(b.path),
  });

  return new NextResponse(null, { status: 204 });
}
