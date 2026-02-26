import { NextRequest, NextResponse } from 'next/server';
import { createRNG, seedFromString } from '@/lib/randomizer/seed';

export const maxDuration = 30;
import { loadTreeGrid, loadSkills, loadSkillDescs } from '@/lib/data-loader';
import { randomizeTrees } from '@/lib/randomizer/tree-randomizer';
import { placeSkills, groupByClass } from '@/lib/randomizer/skill-placer';
import { CLASS_DEFS } from '@/lib/randomizer/config';
import { PreviewData, ClassCode } from '@/lib/randomizer/types';
import { computeActPositions, actShuffleSeed } from '@/lib/randomizer/act-shuffler';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const seedInput = body.seed;

    if (!seedInput && seedInput !== 0) {
      return NextResponse.json({ error: 'Seed is required' }, { status: 400 });
    }

    const actShuffle = body.actShuffle === true;

    const numericSeed = Number(seedInput);
    const seed = (typeof seedInput === 'number' || (typeof seedInput === 'string' && !isNaN(numericSeed) && Number.isInteger(numericSeed)))
      ? Math.trunc(numericSeed)
      : seedFromString(String(seedInput));
    const rng = createRNG(seed);

    // Load data
    const treePages = loadTreeGrid();
    const skills = loadSkills();

    // Randomize
    const treeAssignments = randomizeTrees(rng, treePages);
    const placements = placeSkills(rng, skills, treeAssignments);
    const placementsByClass = groupByClass(placements);

    // Compute act positions using a derived RNG so it matches the randomize route deterministically
    let actPositions: number[] | undefined;
    if (actShuffle) {
      const actRng = createRNG(actShuffleSeed(seed));
      actPositions = computeActPositions(actRng);
    }

    // Build preview data
    const preview: PreviewData = {
      seed,
      ...(actPositions ? { actPositions } : {}),
      classes: CLASS_DEFS.map(classDef => ({
        code: classDef.code,
        name: classDef.name,
        tabs: (treeAssignments.get(classDef.code) || []).map((tree, tabIdx) => {
          const classPlacs = (placementsByClass.get(classDef.code) || [])
            .filter(p => p.tabIndex === tabIdx);

          return {
            sourceClass: tree.className,
            sourceTree: tree.treeIndex,
            skills: classPlacs.map(p => ({
              name: p.skill.skill,
              originalClass: p.skill.charclass,
              row: p.row,
              col: p.col,
            })),
          };
        }),
      })),
    };

    return NextResponse.json(preview);
  } catch (error) {
    console.error('Preview error:', error);
    return NextResponse.json(
      { error: 'Failed to generate preview' },
      { status: 500 },
    );
  }
}
