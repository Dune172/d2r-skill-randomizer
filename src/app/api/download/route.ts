import { NextRequest, NextResponse } from 'next/server';
import { seedFromString } from '@/lib/randomizer/seed';
import { getCached, makeCacheKey, withBuildSegment } from '@/lib/zip-cache';
import { BuildRequestError, resolveClassBuild } from '@/lib/builder/class-build-server';
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { getWeekName, getActiveMutations } from '@/lib/mutations/registry';
import { getWeekStart, getCurrentWeekNumber } from '@/lib/challenge/week';
import { challengeRandomizesMonsters } from '@/lib/challenge/rules';

function slugifyChallenge(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function formatLaIsoDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

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
    // Class Builder downloads carry the share code instead of a seed. It must resolve
    // to the same canonical code and seed /api/randomize keyed the zip under.
    const buildParam = searchParams.get('build');
    let classBuild: ReturnType<typeof resolveClassBuild> | null = null;
    if (buildParam) {
      try {
        classBuild = resolveClassBuild(buildParam);
      } catch (e) {
        if (e instanceof BuildRequestError) return NextResponse.json({ error: e.message }, { status: 400 });
        throw e;
      }
    }

    if (!seedParam && !classBuild) {
      return NextResponse.json({ error: 'Seed parameter required' }, { status: 400 });
    }

    const teleportParam = searchParams.get('teleportStaff');
    const dropSourceParam = searchParams.get('dropSource') || 'Corpsefire';
    const actsParam = searchParams.get('acts');
    const seed = classBuild ? classBuild.seed
      : isNaN(Number(seedParam)) ? seedFromString(seedParam!) : Number(seedParam);
    const playersCount = Math.min(8, Math.max(1, Number(playersParam) || 1));
    const weeklyParam = !classBuild && searchParams.get('weekly') === '1';
    const weekOverrideParam = searchParams.get('weekOverride');
    const weekOverride = weekOverrideParam !== null && Number.isInteger(Number(weekOverrideParam))
      ? Math.max(1, Math.trunc(Number(weekOverrideParam)))
      : null;
    const weeklyKey = weeklyParam ? (weekOverride ?? getCurrentWeekNumber()) : 0;
    const forgottenArts = weeklyParam
      ? getActiveMutations(weeklyKey).some(m => m.id === 'forgotten-arts') : false; // challenge-only
    const teleportStaffLevel = forgottenArts ? 0 : Number(teleportParam) || 0;
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
    const xpDifficultiesParam = searchParams.get('xpDifficulties');
    const xpDifficulties = xpDifficultiesParam
      ? xpDifficultiesParam.split(',').map(Number).filter(n => n >= 1 && n <= 3)
      : [1, 2, 3];

    const teleportStaffSpeed = teleportStaffLevel > 0 && searchParams.get('staffSpeed') !== '0';
    // Weekly challenges are never Race Mode — force off (matching the identical
    // guard in /api/randomize) so the cache key resolves even if the link omits
    // raceMode=0. Outside weekly, raceMode defaults true.
    const raceMode = classBuild || weeklyParam || forgottenArts ? false : (searchParams.get('raceMode') !== '0');
    const enemyShuffle = weeklyParam ? challengeRandomizesMonsters(weeklyKey) : searchParams.get('enemyShuffle') === '1';
    const cacheKey = withBuildSegment(
      makeCacheKey(seed, playersCount, teleportStaffLevel, playersActs, hirelingAura, dropSourceParam, disableChat, horadricCube, enablePrereqs, xpMultiplier, xpActs, xpDifficulties, weeklyKey, teleportStaffSpeed, false, raceMode, enemyShuffle, forgottenArts),
      classBuild?.code,
    );
    const zipBuffer = getCached(cacheKey);

    if (!zipBuffer) {
      return NextResponse.json(
        { error: 'Zip not found. Please generate first.' },
        { status: 404 },
      );
    }

    const weekParam = searchParams.get('week');
    const weekNumber = weekParam ? Number(weekParam) : NaN;
    const isWeekly = weeklyParam && Number.isInteger(weekNumber) && weekNumber >= 1;
    const filename = classBuild
      ? `d2rr_${classBuild.modName}.zip`
      : isWeekly
        ? `d2rr_${slugifyChallenge(getWeekName(weekNumber))}_${formatLaIsoDate(getWeekStart(weekNumber))}.zip`
        : `d2rr_export_${seed}.zip`;

    // A stream serves the cached bytes without rebuilding the archive or
    // copying the whole Buffer into a new response body for each download.
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(zipBuffer);
        controller.close();
      },
    });
    return new NextResponse(body, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(zipBuffer.byteLength),
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
