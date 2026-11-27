import { NextRequest, NextResponse } from 'next/server';
import { seedFromString } from '@/lib/randomizer/seed';

export const maxDuration = 30;
import { normalizeShuffleAmount, shuffleShareOf } from '@/lib/shuffle-amount';
import { BuildRequestError, buildUsesWarlock, resolveClassBuild } from '@/lib/builder/class-build-server';
import { baseGameConflict, normalizeBaseGame } from '@/lib/base-game';
import { hasMutation } from '@/lib/randomizer/mutations';
import { getMutationIds } from '@/lib/mutations/registry';
import { normalizeMutationIds } from '@/lib/mutations/custom';
import { buildPreview } from '@/lib/randomizer/preview';
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const seedInput = body.seed;
    // When the Mystery Box mutation is active, the spoiler must not reveal skills.
    // Mask names/source-class server-side so the real values never leave the server.
    const maskFlag = body.maskSkills === true;
    // No Guard removes defense skills from the shuffle pool, which changes every
    // downstream placement. The spoiler must run the same exclusions or it shows
    // a tree the generated mod will not contain.
    // A Class Builder share code: its seed randomizes the other seven classes.
    let classBuild: ReturnType<typeof resolveClassBuild> | null = null;
    if (body.classBuild != null) {
      try {
        classBuild = resolveClassBuild(body.classBuild);
      } catch (e) {
        if (e instanceof BuildRequestError) return NextResponse.json({ error: e.message }, { status: 400 });
        throw e;
      }
    }
    const weekNumber = !classBuild && Number.isInteger(body.weekNumber) ? Number(body.weekNumber) : 0;
    // A challenge previews its own set; otherwise the player's picks (builds included,
    // since No Guard also reshapes the seven randomized classes).
    const mutationIds = weekNumber > 0 ? getMutationIds(weekNumber) : normalizeMutationIds(body.mutations);
    // Same guard as /api/randomize: challenges are always Reign of the Warlock.
    const baseGame = weekNumber > 0 ? false : normalizeBaseGame(body);
    if (baseGame && classBuild && buildUsesWarlock(classBuild)) {
      return NextResponse.json({ error: baseGameConflict({ baseGame, warlockInBuild: true }) }, { status: 400 });
    }
    const maskSkills = maskFlag || hasMutation(mutationIds, 'mystery-box');

    if (!classBuild && !seedInput && seedInput !== 0) {
      return NextResponse.json({ error: 'Seed is required' }, { status: 400 });
    }

    const numericSeed = Number(seedInput);
    const seed = classBuild ? classBuild.seed : (typeof seedInput === 'number' || (typeof seedInput === 'string' && !isNaN(numericSeed) && Number.isInteger(numericSeed)))
      ? Math.trunc(numericSeed)
      : seedFromString(String(seedInput));
    const preview = buildPreview({
      seed,
      mutationIds,
      maskSkills,
      classBuild,
      baseGame,
      // Same guard as /api/randomize: challenges and builds always shuffle fully.
      shuffleShare: classBuild || weekNumber > 0 ? undefined : shuffleShareOf(normalizeShuffleAmount(body.shuffleAmount)),
    });

    return NextResponse.json(preview);
  } catch (error) {
    console.error('Preview error:', error);
    return NextResponse.json(
      { error: 'Failed to generate preview' },
      { status: 500 },
    );
  }
}
