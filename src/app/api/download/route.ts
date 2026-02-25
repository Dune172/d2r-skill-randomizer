import { NextRequest, NextResponse } from 'next/server';
import { seedFromString } from '@/lib/randomizer/seed';

export const maxDuration = 60;

// We need a shared cache between randomize and download routes.
// Since they're in the same process, we use a module-level cache.
// Import from a shared location rather than the randomize route to avoid circular deps.
import { getZipCache, makeCacheKey } from '@/lib/zip-cache';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const seedParam = searchParams.get('seed');
    const playersParam = searchParams.get('players');

    if (!seedParam) {
      return NextResponse.json({ error: 'Seed parameter required' }, { status: 400 });
    }

    const teleportParam = searchParams.get('teleportStaff');
    const seed = isNaN(Number(seedParam)) ? seedFromString(seedParam) : Number(seedParam);
    const playersCount = Math.min(8, Math.max(1, Number(playersParam) || 1));
    const teleportStaffLevel = Number(teleportParam) || 0;
    const cacheKey = makeCacheKey(seed, playersCount, teleportStaffLevel);
    const zipCache = getZipCache();
    const zipBuffer = zipCache.get(cacheKey);

    if (!zipBuffer) {
      return NextResponse.json(
        { error: 'Zip not found. Please generate first.' },
        { status: 404 },
      );
    }

    return new NextResponse(new Uint8Array(zipBuffer), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="d2r_skill_randomizer_seed${seed}.zip"`,
        'Content-Length': String(zipBuffer.length),
      },
    });
  } catch (error) {
    console.error('Download error:', error);
    return NextResponse.json(
      { error: 'Failed to download' },
      { status: 500 },
    );
  }
}
