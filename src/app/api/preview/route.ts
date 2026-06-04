import { NextRequest, NextResponse } from 'next/server';
import { createRNG, seedFromString } from '@/lib/randomizer/seed';

export const maxDuration = 30;
import { loadTreeGrid, loadSkills, loadSkillDescs, loadSkillStrings } from '@/lib/data-loader';
import { randomizeTrees } from '@/lib/randomizer/tree-randomizer';
import { placeSkills, groupByClass } from '@/lib/randomizer/skill-placer';
import { CLASS_DEFS } from '@/lib/randomizer/config';
import { PreviewData, SkillEntry } from '@/lib/randomizer/types';
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const seedInput = body.seed;
    // When the Mystery Box mutation is active, the spoiler must not reveal skills.
    // Mask names/source-class server-side so the real values never leave the server.
    const maskSkills = body.maskSkills === true;

    if (!seedInput && seedInput !== 0) {
      return NextResponse.json({ error: 'Seed is required' }, { status: 400 });
    }

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
    const { placements, substitutes } = placeSkills(rng, skills, treeAssignments);
    const placementsByClass = groupByClass(placements);

    // Resolve in-game (player-facing) names: skill → skilldesc → str name → localized string.
    // Internal skills.txt names like "Fire Trauma" map to "Fire Blast" in-game; the preview
    // should show what the player will actually see.
    const skillDescs = loadSkillDescs();
    const stringsByKey = new Map(loadSkillStrings().map(s => [s.Key, s.enUS]));
    // Substitute slots keep the dropped skill's identity but the mod output overwrites
    // that slot's `str name` with the source skill's str name — so resolve through the
    // source's skilldesc to match what shows in-game.
    const sourceBySubstitute = new Map(substitutes.map(s => [s.droppedSkill.skill, s.sourceSkill]));
    const resolveDisplayName = (skill: SkillEntry): string => {
      const effective = sourceBySubstitute.get(skill.skill) ?? skill;
      const localized = stringsByKey.get(skillDescs.get(effective.skilldesc)?.strName ?? '');
      return localized && localized.trim() ? localized : skill.skill;
    };

    // Build preview data
    const preview: PreviewData = {
      seed,
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
              name: maskSkills ? '???' : resolveDisplayName(p.skill),
              originalClass: maskSkills ? '?' : p.skill.charclass,
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
