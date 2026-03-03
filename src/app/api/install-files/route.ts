import { NextRequest, NextResponse } from 'next/server';
import AdmZip from 'adm-zip';
import { getZipCache, makeCacheKey } from '@/lib/zip-cache';
import { seedFromString } from '@/lib/randomizer/seed';

export const maxDuration = 60;

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
    const hirelingAura   = searchParams.get('hirelingAura')   !== '0';
    const hirelingSkills = searchParams.get('hirelingSkills') !== '0';

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
    const zip = new AdmZip(Buffer.from(zipBuffer));

    const files = zip.getEntries()
      .filter(e => !e.isDirectory && e.entryName.startsWith(`${modName}/`))
      .map(e => ({
        path: e.entryName.slice(modName.length + 1), // relative path inside mod folder
        content: e.getData().toString('base64'),
      }));

    return NextResponse.json({ modName, files });
  } catch (error) {
    console.error('Install-files error:', error);
    return NextResponse.json(
      { error: 'Failed to get install files' },
      { status: 500 },
    );
  }
}
