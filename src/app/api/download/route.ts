import { NextRequest, NextResponse } from 'next/server';
import { seedFromString } from '@/lib/randomizer/seed';

// We need a shared cache between randomize and download routes.
// Since they're in the same process, we use a module-level cache.
// Import from a shared location rather than the randomize route to avoid circular deps.
import { getZipCache } from '@/lib/zip-cache';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const seedParam = searchParams.get('seed');

    if (!seedParam) {
      return NextResponse.json({ error: 'Seed parameter required' }, { status: 400 });
    }

    const seed = isNaN(Number(seedParam)) ? seedFromString(seedParam) : Number(seedParam);
    const zipCache = getZipCache();
    const zipBuffer = zipCache.get(seed);

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
