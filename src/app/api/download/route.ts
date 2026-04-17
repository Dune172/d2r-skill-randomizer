import { NextRequest, NextResponse } from 'next/server';
import AdmZip from 'adm-zip';
import { seedFromString } from '@/lib/randomizer/seed';
import { getCached, makeCacheKey } from '@/lib/zip-cache';
import { createD2RShortcut } from '@/lib/lnk-builder';
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    // Lighter rate limit than /randomize — downloads are cheap, but we still
    // don't want someone hammering the endpoint in a loop.
    const ip = getClientIp(request);
    const rl = checkRateLimit(`download:${ip}`, 30, 60_000);
    if (!rl.ok) {
      return rateLimitResponse(rl.retryAfter);
    }

    const { searchParams } = new URL(request.url);
    const seedParam = searchParams.get('seed');
    const playersParam = searchParams.get('players');

    if (!seedParam) {
      return NextResponse.json({ error: 'Seed parameter required' }, { status: 400 });
    }

    const teleportParam = searchParams.get('teleportStaff');
    const dropSourceParam = searchParams.get('dropSource') || 'Corpsefire';
    const actsParam = searchParams.get('acts');
    const seed = isNaN(Number(seedParam)) ? seedFromString(seedParam) : Number(seedParam);
    const playersCount = Math.min(8, Math.max(1, Number(playersParam) || 1));
    const teleportStaffLevel = Number(teleportParam) || 0;
    const playersActs = actsParam
      ? actsParam.split(',').map(Number).filter(n => n >= 1 && n <= 5)
      : [1, 2, 3, 4, 5];
    const hirelingAura   = searchParams.get('hirelingAura')   !== '0';  // default true
    const disableChat    = searchParams.get('disableChat')    === '1';  // default false
    const horadricCube   = searchParams.get('cube')           === '1';  // default false
    const enablePrereqs  = searchParams.get('noPrereqs')      !== '1';  // default true
    const xpMultiplier   = Math.min(3, Math.max(1, Number(searchParams.get('xpMultiplier')) || 1));
    const xpActsParam    = searchParams.get('xpActs');
    const xpActs = xpActsParam
      ? xpActsParam.split(',').map(Number).filter(n => n >= 1 && n <= 5)
      : [1, 2, 3, 4, 5];

    const weeklyKey  = searchParams.get('weekly') === '1' ? -1 : 0;
    const teleportStaffSpeed = teleportStaffLevel > 0 && searchParams.get('staffSpeed') !== '0';
    const excludeTeleport = searchParams.get('excludeTeleport') === '1';
    const cacheKey = makeCacheKey(seed, playersCount, teleportStaffLevel, playersActs, hirelingAura, dropSourceParam, disableChat, horadricCube, enablePrereqs, xpMultiplier, xpActs, weeklyKey, teleportStaffSpeed, excludeTeleport);
    const zipBuffer = getCached(cacheKey);

    if (!zipBuffer) {
      return NextResponse.json(
        { error: 'Zip not found. Please generate first.' },
        { status: 404 },
      );
    }

    const modName = `seed${seed}`;
    const mapSeed = seed >>> 0;
    const zip = new AdmZip(Buffer.from(zipBuffer));
    zip.addFile(`D2R Randomizer ${seed}.lnk`, createD2RShortcut(modName, mapSeed));

    return new NextResponse(new Uint8Array(zip.toBuffer()), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="d2r_randomizer_seed${seed}.zip"`,
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
