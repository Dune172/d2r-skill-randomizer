import { NextRequest, NextResponse } from 'next/server';

/**
 * In-memory sliding-window rate limiter.
 * Safe for single-instance deployments (Hostinger VPS). Do NOT use if the
 * app is ever scaled horizontally — swap for Redis / Upstash in that case.
 */

type Bucket = { timestamps: number[] };

const buckets = new Map<string, Bucket>();

/** Periodic cleanup so stale IPs don't accumulate. Runs every 5 minutes. */
let cleanupStarted = false;
function ensureCleanup() {
  if (cleanupStarted) return;
  cleanupStarted = true;
  setInterval(() => {
    const cutoff = Date.now() - 10 * 60 * 1000; // 10 minutes
    for (const [key, bucket] of buckets) {
      bucket.timestamps = bucket.timestamps.filter(t => t >= cutoff);
      if (bucket.timestamps.length === 0) buckets.delete(key);
    }
  }, 5 * 60 * 1000).unref?.();
}

export function getClientIp(request: NextRequest): string {
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) {
    // First entry is the original client
    const first = fwd.split(',')[0]?.trim();
    if (first) return first;
  }
  const real = request.headers.get('x-real-ip');
  if (real) return real.trim();
  return 'unknown';
}

export type RateLimitResult =
  | { ok: true }
  | { ok: false; retryAfter: number };

/**
 * Check whether a request from `ip` is allowed under the given window.
 * If allowed, records the timestamp and returns { ok: true }.
 * If rejected, returns { ok: false, retryAfter } where retryAfter is seconds
 * until the oldest in-window request rolls off.
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  ensureCleanup();
  const now = Date.now();
  const cutoff = now - windowMs;
  const bucket = buckets.get(key) ?? { timestamps: [] };

  // Drop timestamps outside the window
  bucket.timestamps = bucket.timestamps.filter(t => t > cutoff);

  if (bucket.timestamps.length >= limit) {
    const oldest = bucket.timestamps[0];
    const retryAfter = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    buckets.set(key, bucket);
    return { ok: false, retryAfter };
  }

  bucket.timestamps.push(now);
  buckets.set(key, bucket);
  return { ok: true };
}

/**
 * Convenience helper: return a 429 NextResponse with Retry-After header.
 */
export function rateLimitResponse(retryAfter: number, message?: string) {
  return NextResponse.json(
    {
      error:
        message ??
        'Too many requests — please slow down and try again in a moment.',
    },
    {
      status: 429,
      headers: { 'Retry-After': String(retryAfter) },
    },
  );
}
