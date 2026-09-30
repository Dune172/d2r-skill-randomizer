import type { ClassCode, SkillEntry, TreePage } from './types';
import type { SeededRNG } from './seed';
import { randomizeTrees } from './tree-randomizer';
import { type FixedClass, placeSkills } from './skill-placer';

/**
 * Tree assignment + skill placement: the first two RNG consumers of a build.
 * Shared by /api/randomize and /api/preview so the spoiler can never show a
 * tree the mod doesn't contain.
 *
 * With a hand-built class, randomizeTrees still runs unchanged (same draws) and
 * its pick for that class is then overwritten with the builder's pages.
 */
export function runPlacement(
  rng: SeededRNG,
  input: {
    treePages: Map<string, TreePage>;
    skills: SkillEntry[];
    excludeSkills?: Set<string>;
    build?: { fixed: FixedClass; pages: TreePage[] };
  },
) {
  const treeAssignments: Map<ClassCode, TreePage[]> = randomizeTrees(rng, input.treePages);
  if (input.build) treeAssignments.set(input.build.fixed.classCode, input.build.pages);
  const opts = {
    ...(input.excludeSkills && input.excludeSkills.size > 0 ? { excludeSkills: input.excludeSkills } : {}),
    ...(input.build ? { fixed: input.build.fixed } : {}),
  };
  const placed = placeSkills(rng, input.skills, treeAssignments, Object.keys(opts).length > 0 ? opts : undefined);
  return { treeAssignments, ...placed };
}
