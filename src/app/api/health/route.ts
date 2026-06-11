import { NextResponse } from 'next/server';
import { getQueueDepth } from '@/lib/generation-queue';
import { getZipCacheStats } from '@/lib/zip-cache';
import { getCount } from '@/lib/counter';
import { isWarmupDone } from '@/lib/warmup';

export const dynamic = 'force-dynamic';

// Lightweight runtime metrics for uptime monitors + on-call humans. No auth
// required — nothing here is sensitive; it's the same data you'd infer from
// visible site behavior. Poll every minute from UptimeRobot or similar during
// a traffic spike.
export async function GET() {
  const mem = process.memoryUsage();
  const cache = getZipCacheStats();
  return NextResponse.json({
    ok: true,
    uptime: Math.floor(process.uptime()),
    queueDepth: getQueueDepth(),
    warmup: isWarmupDone(),
    zipCache: {
      entries: cache.entries,
      bytes: cache.bytes,
      maxEntries: cache.maxEntries,
      maxBytes: cache.maxBytes,
    },
    memory: {
      rss: mem.rss,
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
    },
    counter: getCount(),
  }, {
    // Open CORS: read-only, non-sensitive; lets the marketing dashboard poll it.
    headers: { 'Access-Control-Allow-Origin': '*' },
  });
}
