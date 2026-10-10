import { NextRequest, NextResponse } from 'next/server';
import AdmZip from 'adm-zip';
import { generateMod } from '@/lib/randomizer/generate-mod';
import { AP_CONTRACT_VERSION } from '@/lib/randomizer/ap-mode';
import { ClassCode } from '@/lib/randomizer/types';
import { CLASS_DEFS } from '@/lib/randomizer/config';
import { DEFAULT_OPEN_ACTS } from '@/lib/randomizer/open-acts/options';
import { getCachedFromDisk, setCachedOnDisk, makeCacheKey, withApSegment } from '@/lib/zip-cache';
import { enqueueGeneration, getQueueDepth } from '@/lib/generation-queue';
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { incrementCount } from '@/lib/counter';

export const maxDuration = 60;

/**
 * POST /api/archipelago/mod — build an Archipelago-mode mod and return the ZIP directly.
 *
 * One call, unlike the public POST /api/randomize + GET /api/download pair, which has to
 * re-derive the same cache key in two routes. The caller here is the companion client,
 * a program, so there is no page to hand a "ready" status to.
 *
 * The manifest travels inside the zip, so the mod and its description cannot drift apart.
 *
 * Options that fight the Archipelago design are not exposed at all: prerequisites would
 * refuse out-of-order points, Race Mode replaces seven classes with filler, and a weekly
 * challenge can rewrite the very tables AP mode pins. The client cannot ask for a
 * combination that would not work.
 */

const VALID_CLASSES = new Set<string>(CLASS_DEFS.map(d => d.code));

// Concurrent requests for the same mod share one build.
const pendingBuilds = new Map<string, Promise<Buffer>>();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (Number(body.contractVersion) !== AP_CONTRACT_VERSION) {
      return NextResponse.json({
        error: `Contract version mismatch: client sent ${body.contractVersion ?? 'nothing'}, ` +
               `server speaks ${AP_CONTRACT_VERSION}. Update the client and the apworld.`,
        serverContractVersion: AP_CONTRACT_VERSION,
      }, { status: 409 });
    }

    const seed = Number(body.seed);
    if (!Number.isInteger(seed) || seed < 1 || seed > 0x7fffffff) {
      return NextResponse.json({ error: 'seed must be a positive 31-bit integer' }, { status: 400 });
    }

    const characterClass = String(body.characterClass ?? '');
    if (!VALID_CLASSES.has(characterClass)) {
      return NextResponse.json({
        error: `Unknown characterClass "${body.characterClass}"`,
        valid: [...VALID_CLASSES],
      }, { status: 400 });
    }

    // This becomes a folder name on the player's disk: reject rather than rewrite, so
    // the client is never told about a folder other than the one it asked for.
    const savepath = String(body.savepath ?? '');
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(savepath)) {
      return NextResponse.json(
        { error: 'savepath must be 1-40 characters: letters, digits, dash or underscore' },
        { status: 400 },
      );
    }

    const keyItems = body.options?.keyItems === true;
    const xpMultiplier = Math.min(3, Math.max(1, Math.trunc(Number(body.options?.xpMultiplier)) || 1));
    const enemyShuffle = body.options?.monsterShuffle === true;
    const allActs = [1, 2, 3, 4, 5];
    const allDifficulties = [1, 2, 3];

    // No season segment: an AP mod carries no seasonal overlay, so its key must not
    // change when the month does.
    const cacheKey = withApSegment(
      makeCacheKey(seed, 1, 0, allActs, true, 'Corpsefire', false, true, false,
        xpMultiplier, allActs, allDifficulties, 0, false, false, false, enemyShuffle, false, ''),
      `${characterClass}:${savepath}:${keyItems ? 'k' : ''}:${AP_CONTRACT_VERSION}`,
    );

    const respond = (zip: Buffer) =>
      body.format === 'manifest' ? manifestResponse(zip) : zipResponse(zip, seed, characterClass);

    const cached = getCachedFromDisk(cacheKey);
    if (cached) return respond(cached);

    const pending = pendingBuilds.get(cacheKey);
    if (pending) return respond(await pending);

    // Queue check before the rate limit, so a retry of a shed request costs no quota.
    if (getQueueDepth() >= 8) {
      return NextResponse.json(
        { error: 'Server is busy generating mods. Try again shortly.' },
        { status: 503, headers: { 'Retry-After': '5', 'Cache-Control': 'no-store' } },
      );
    }
    const rl = checkRateLimit(`ap:${getClientIp(request)}`, 6, 60_000);
    if (!rl.ok) return rateLimitResponse(rl.retryAfter);

    const build = enqueueGeneration(async () => {
      const again = getCachedFromDisk(cacheKey);
      if (again) return again;

      const { zip, manifest } = await generateMod(seed, {
        classBuild: null,
        weeklyEnabled: false,      // weekly mutations can rewrite the tables AP mode pins
        weekNumber: 0,
        forgottenArts: false,      // disables skill trees altogether
        enablePrereqs: false,      // points arrive in any order; a prereq chain would refuse them
        playersEnabled: false,
        playersCount: 1,
        playersActs: allActs,
        startingTeleportStaff: false,
        teleportStaffLevel: 0,
        teleportStaffDropSource: 'Corpsefire',
        teleportStaffSpeed: false,
        hirelingAura: true,
        disableChat: false,
        startingHoradricCube: true,
        xpMultiplier,
        xpActs: allActs,
        xpDifficulties: allDifficulties,
        raceMode: false,           // would replace seven classes with Prayer filler
        enemyShuffle,
        openActs: DEFAULT_OPEN_ACTS,  // its saves and quest changes are not part of AP mode
        mutationIds: [],
        customMutations: [],
        ap: { characterClass: characterClass as ClassCode, savepath, keyItems },
      });
      if (!manifest) throw new Error('Archipelago mode produced no manifest');

      // Disk only: a slot's mod is fetched once or twice, and must not evict public
      // seeds from the memory tier.
      setCachedOnDisk(cacheKey, zip);
      incrementCount();
      return zip;
    });
    pendingBuilds.set(cacheKey, build);
    try {
      return respond(await build);
    } finally {
      pendingBuilds.delete(cacheKey);
    }
  } catch (error) {
    console.error('Archipelago mod error:', error);
    return NextResponse.json(
      { error: 'Failed to generate the Archipelago mod.' },
      { status: 500 },
    );
  }
}

/** Just the manifest, read back OUT of the zip, so it is literally the one that ships. */
function manifestResponse(zip: Buffer): NextResponse {
  const entry = new AdmZip(zip)
    .getEntries()
    .find(e => e.entryName.endsWith('d2rr-ap-manifest.json'));
  if (!entry) {
    return NextResponse.json({ error: 'Manifest missing from generated zip' }, { status: 500 });
  }
  return NextResponse.json(JSON.parse(entry.getData().toString('utf-8')));
}

function zipResponse(zip: Buffer, seed: number, characterClass: string): NextResponse {
  return new NextResponse(new Uint8Array(zip), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="d2rr_ap_${seed}_${characterClass}.zip"`,
      'X-D2RR-Contract-Version': String(AP_CONTRACT_VERSION),
      'Cache-Control': 'no-store',
    },
  });
}
