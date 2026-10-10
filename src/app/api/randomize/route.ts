import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60;
import { seedFromString } from '@/lib/randomizer/seed';
import { generateMod } from '@/lib/randomizer/generate-mod';
import { BuildRequestError, resolveClassBuild } from '@/lib/builder/class-build-server';
import { getCurrentWeekNumber } from '@/lib/challenge/week';
import { challengeRandomizesMonsters } from '@/lib/challenge/rules';
import { getZipCacheStats, hasCached, setCached, makeCacheKey, withBuildSegment } from '@/lib/zip-cache';
import { incrementCount } from '@/lib/counter';
import { enqueueGeneration, getQueueDepth } from '@/lib/generation-queue';
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { isMutationActiveForWeek } from '@/lib/randomizer/mutations';
import { getMutationIds } from '@/lib/mutations/registry';
import { normalizeMutationIds, validateMutations, mutationCacheSegment, mutationFeatureKeys } from '@/lib/mutations/custom';
import { DEFAULT_OPEN_ACTS, normalizeOpenActs, openActsCacheSegment, openActsFeatureKeys } from '@/lib/randomizer/open-acts/options';
import { recordFeatures } from '@/lib/feature-stats';

// Concurrent requests for the same mod share one build and one rate-limit slot.
const pendingBuilds = new Map<string, Promise<void>>();

// Rate-limited 503 telemetry: log at most once per 10s so a sustained overload
// doesn't spam stdout. Shows enough context (depth, RSS, cache) to post-mortem
// a spike without attaching a profiler.
let lastBusyLog = 0;
function logBusy(ip: string): void {
  const now = Date.now();
  if (now - lastBusyLog < 10_000) return;
  lastBusyLog = now;
  const mem = process.memoryUsage();
  const cache = getZipCacheStats();
  console.warn(
    `[randomize:busy] ts=${new Date(now).toISOString()} ip=${ip} ` +
    `queueDepth=${getQueueDepth()} rssMB=${(mem.rss / 1024 / 1024).toFixed(0)} ` +
    `heapUsedMB=${(mem.heapUsed / 1024 / 1024).toFixed(0)} ` +
    `zipCache=${cache.entries}/${cache.maxEntries} ` +
    `zipBytesMB=${(cache.bytes / 1024 / 1024).toFixed(0)}`,
  );
}


export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const seedInput = body.seed;
    // A hand-built class from the Class Builder. Its share code carries the seed for the
    // other seven classes; challenge rules and Race Mode never apply to it.
    let classBuild: ReturnType<typeof resolveClassBuild> | null = null;
    if (body.classBuild != null) {
      try {
        classBuild = resolveClassBuild(body.classBuild);
      } catch (e) {
        if (e instanceof BuildRequestError) return NextResponse.json({ error: e.message }, { status: 400 });
        throw e;
      }
    }
    const weeklyEnabled = !classBuild && body.weeklyChallenge?.enabled === true;
    const weeklyOverride: number | undefined =
      Number.isInteger(body.weeklyChallenge?.weekOverride)
        ? Math.max(1, Math.trunc(body.weeklyChallenge.weekOverride))
        : undefined;
    // Resolve once before caching/queueing so a rollover cannot mix rules.
    const weekNumber = weeklyEnabled ? (weeklyOverride ?? getCurrentWeekNumber()) : 0;
    const forgottenArts = weeklyEnabled
      ? isMutationActiveForWeek(weekNumber, 'forgotten-arts') : false; // challenge-only
    const enablePrereqs = body.enablePrereqs !== false; // default true
    const playersEnabled = body.playersEnabled === true;
    const playersCount = Math.min(8, Math.max(1, Number(body.playersCount) || 1));
    const playersActs: number[] = Array.isArray(body.playersActs)
      ? (body.playersActs as unknown[]).map(Number).filter(n => n >= 1 && n <= 5)
      : [1, 2, 3, 4, 5];
    const startingTeleportStaff = !forgottenArts && body.startingItems?.teleportStaff === true;
    const teleportStaffLevel = startingTeleportStaff
      ? (Number(body.startingItems?.teleportStaffLevel) || 1)
      : 0;
    const teleportStaffDropSource: string = body.startingItems?.teleportStaffDropSource || 'Corpsefire';
    const teleportStaffSpeed = body.startingItems?.teleportStaffSpeed !== false;
    const hirelingAura       = body.hirelingAura       !== false;  // default true
    const disableChat        = body.disableChat        === true;   // default false
    const startingHoradricCube = body.startingItems?.horadricCube === true;
    const xpMultiplier = Math.min(3, Math.max(1, Number(body.xpMultiplier) || 1));
    const xpActs: number[] = Array.isArray(body.xpActs)
      ? (body.xpActs as unknown[]).map(Number).filter(n => n >= 1 && n <= 5)
      : [1, 2, 3, 4, 5];
    const xpDifficulties: number[] = Array.isArray(body.xpDifficulties)
      ? (body.xpDifficulties as unknown[]).map(Number).filter(n => n >= 1 && n <= 3)
      : [1, 2, 3];
    // Weekly challenges are always full randomization — never Race Mode. Force it
    // off server-side so no caller (challenge page, warmup, or a hand-built link)
    // can produce a race-mode challenge regardless of the raceMode they pass.
    // Must stay in lockstep with the identical guard in /api/download so the cache
    // keys agree. Outside weekly, raceMode defaults true (matches Season preset).
    // A hand-built class would be erased by Race Mode's Prayer filler, so it is
    // forced off for builds too — mirrored in /api/download.
    const raceMode = classBuild || weeklyEnabled || forgottenArts ? false : (body.raceMode !== false);
    const enemyShuffle = weeklyEnabled ? challengeRandomizesMonsters(weekNumber) : body.enemyShuffle === true;
    // Open Acts is a main-generator option: challenges and Class Builder mods never get it.
    // Mirrored in /api/download so the cache keys agree.
    // Class Builder mods support Open Acts; challenges keep their fixed rules.
    const openActs = weeklyEnabled || forgottenArts
      ? DEFAULT_OPEN_ACTS : normalizeOpenActs(body.openActs, raceMode);
    // Player-picked mutations (Generate page). A challenge always uses its own set and
    // ignores any picks; mirrored in /api/download so the cache keys agree.
    const customMutations = weeklyEnabled ? [] : normalizeMutationIds(body.mutations);
    const mutationError = validateMutations(customMutations, {
      openActsShuffle: openActs.shuffle,
      buildSkills: classBuild ? Object.values(classBuild.spec.slots) : undefined,
    });
    if (mutationError) return NextResponse.json({ error: mutationError }, { status: 400 });
    const mutationIds: readonly number[] = weeklyEnabled ? getMutationIds(weekNumber) : customMutations;
    const featureKeys = [
      ...openActsFeatureKeys(openActs, { raceMode, classBuild: !!classBuild }),
      ...mutationFeatureKeys(customMutations),
    ];
    if (!classBuild && !seedInput && seedInput !== 0) {
      return NextResponse.json({ error: 'Seed is required' }, { status: 400 });
    }

    const numericSeed = Number(seedInput);
    const seed = classBuild ? classBuild.seed : (typeof seedInput === 'number' || (typeof seedInput === 'string' && !isNaN(numericSeed) && Number.isInteger(numericSeed)))
      ? Math.trunc(numericSeed)
      : seedFromString(String(seedInput));
    const effectivePlayers = playersEnabled ? playersCount : 1;
    const effectiveActs = effectivePlayers > 1 ? playersActs : [1, 2, 3, 4, 5];
    const effectiveXpActs = xpMultiplier > 1 ? xpActs : [1, 2, 3, 4, 5];
    const effectiveXpDifficulties = xpMultiplier > 1 ? xpDifficulties : [1, 2, 3];
    const cacheKey = withBuildSegment(
      makeCacheKey(seed, effectivePlayers, teleportStaffLevel, effectiveActs, hirelingAura, teleportStaffDropSource, disableChat, startingHoradricCube, enablePrereqs, xpMultiplier, effectiveXpActs, effectiveXpDifficulties, weekNumber, startingTeleportStaff && teleportStaffSpeed, false, raceMode, enemyShuffle, forgottenArts)
        + openActsCacheSegment(openActs) + mutationCacheSegment(customMutations),
      classBuild?.code,
    );
    const ready = { seed, status: 'ready', ...(classBuild ? { build: classBuild.code, modName: classBuild.modName } : {}) };

    // Check cache (fast path — bypasses queue AND rate limit so users can
    // re-download a seed they already generated without being throttled)
    if (hasCached(cacheKey)) {
      recordFeatures(featureKeys);
      return NextResponse.json(ready);
    }

    const pending = pendingBuilds.get(cacheKey);
    if (pending) {
      await pending;
      recordFeatures(featureKeys);
      return NextResponse.json(ready);
    }

    const ip = getClientIp(request);
    // Reject early if queue is already backed up to prevent cascade timeouts.
    // 8 deep: with ~3-5s per gen, worst-case wait is ~30-40s — better UX than
    // hard-rejecting a legitimate burst. Check BEFORE charging the rate limit:
    // automatic retries of a rejected build must not use up the user's quota.
    if (getQueueDepth() >= 8) {
      logBusy(ip);
      return NextResponse.json(
        { error: 'Server is busy — too many mods generating at once. Try again in a moment!' },
        { status: 503, headers: { 'Retry-After': '5', 'Cache-Control': 'no-store' } },
      );
    }

    // Per-IP rate limit: 3 admitted fresh generations per 60s.
    const rl = checkRateLimit(`randomize:${ip}`, 3, 60_000);
    if (!rl.ok) {
      return rateLimitResponse(
        rl.retryAfter,
        `You're generating mods too quickly. Try again in ${rl.retryAfter}s.`,
      );
    }

    // Serialize generation so only one mod builds at a time
    const build = enqueueGeneration(async () => {

    // Re-check cache inside the queue in case another request built it while we waited
    if (hasCached(cacheKey)) return;

    const { zip } = await generateMod(seed, {
      classBuild,
      weeklyEnabled,
      weekNumber,
      forgottenArts,
      enablePrereqs,
      playersEnabled,
      playersCount,
      playersActs,
      startingTeleportStaff,
      teleportStaffLevel,
      teleportStaffDropSource,
      teleportStaffSpeed,
      hirelingAura,
      disableChat,
      startingHoradricCube,
      xpMultiplier,
      xpActs,
      xpDifficulties,
      raceMode,
      enemyShuffle,
      openActs,
      mutationIds,
      customMutations,
    });

    // Cache the result (byte-bounded LRU handles eviction internally)
    setCached(cacheKey, zip);
    incrementCount();

    }); // end enqueueGeneration
    pendingBuilds.set(cacheKey, build);
    try {
      await build;
    } finally {
      pendingBuilds.delete(cacheKey);
    }

    recordFeatures(featureKeys);
    return NextResponse.json(ready);
  } catch (error) {
    // Log the full error server-side for debugging; return a generic message
    // to the client so stack traces and internal paths don't leak.
    console.error('Randomize error:', error);
    return NextResponse.json(
      { error: 'Something went wrong generating your mod. Please try again.' },
      { status: 500 },
    );
  }
}
