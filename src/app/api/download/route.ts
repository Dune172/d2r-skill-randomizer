import { NextRequest, NextResponse } from 'next/server';
import AdmZip from 'adm-zip';
import { seedFromString } from '@/lib/randomizer/seed';
import { createInstallerBat } from '@/lib/bat-builder';

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
    const actsParam = searchParams.get('acts');
    const seed = isNaN(Number(seedParam)) ? seedFromString(seedParam) : Number(seedParam);
    const playersCount = Math.min(8, Math.max(1, Number(playersParam) || 1));
    const teleportStaffLevel = Number(teleportParam) || 0;
    const playersActs = actsParam
      ? actsParam.split(',').map(Number).filter(n => n >= 1 && n <= 5)
      : [1, 2, 3, 4, 5];
    const logicParam = searchParams.get('logic') === 'normal' ? 'normal' : 'minimal';
    const hirelingAura   = searchParams.get('hirelingAura')   !== '0';  // default true
    const hirelingSkills = searchParams.get('hirelingSkills') !== '0';  // default true
    const d2rDir = searchParams.get('d2rDir') || undefined;
    const cacheKey = makeCacheKey(seed, playersCount, teleportStaffLevel, playersActs, logicParam, hirelingAura, hirelingSkills);
    const zipCache = getZipCache();
    const zipBuffer = zipCache.get(cacheKey);

    if (!zipBuffer) {
      return NextResponse.json(
        { error: 'Zip not found. Please generate first.' },
        { status: 404 },
      );
    }

    const modName = `seed_${seed}`;
    const batBuffer = createInstallerBat(modName, d2rDir);
    const zip = new AdmZip(Buffer.from(zipBuffer));
    zip.addFile('Install and Launch.bat', batBuffer);
    const modifiedBuffer = zip.toBuffer();

    return new NextResponse(new Uint8Array(modifiedBuffer), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="d2r_skill_randomizer_seed${seed}.zip"`,
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
