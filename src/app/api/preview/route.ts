import { NextRequest, NextResponse } from 'next/server';
import { seedFromString } from '@/lib/randomizer/seed';
import { getPreviewJson } from '@/lib/randomizer/preview';

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const seedInput = body.seed;
    // When the Mystery Box mutation is active, the spoiler must not reveal skills.
    // Mask names/source-class server-side so the real values never leave the server.
    const maskSkills = body.maskSkills === true;
    // No Guard removes defense skills from the shuffle pool, which changes every
    // downstream placement. The spoiler must run the same exclusions or it shows
    // a tree the generated mod will not contain.
    const weekNumber = Number.isInteger(body.weekNumber) ? Number(body.weekNumber) : 0;

    if (!seedInput && seedInput !== 0) {
      return NextResponse.json({ error: 'Seed is required' }, { status: 400 });
    }

    const numericSeed = Number(seedInput);
    const seed = (typeof seedInput === 'number' || (typeof seedInput === 'string' && !isNaN(numericSeed) && Number.isInteger(numericSeed)))
      ? Math.trunc(numericSeed)
      : seedFromString(String(seedInput));

    // Memoized in src/lib/randomizer/preview.ts — identical inputs never
    // recompute. The challenge page renders its own preview server-side and
    // does not call this at all; this route serves arbitrary user seeds from
    // /generate.
    return new NextResponse(getPreviewJson(seed, maskSkills, weekNumber), {
      headers: { 'content-type': 'application/json' },
    });
  } catch (error) {
    console.error('Preview error:', error);
    return NextResponse.json(
      { error: 'Failed to generate preview' },
      { status: 500 },
    );
  }
}
