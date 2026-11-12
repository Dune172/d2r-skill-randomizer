import type { ClassCode, ClassDef, SkillEntry, TreePage } from './types';
import type { SeededRNG } from './seed';
import { randomizeTrees } from './tree-randomizer';
import { type FixedClass, placeSkills } from './skill-placer';
import { CLASS_DEFS } from './config';

/**
 * Tree assignment + skill placement: the first two RNG consumers of a build.
 * Shared by /api/randomize and /api/preview so the spoiler can never show a
 * tree the mod doesn't contain.
 *
 * With a hand-built class, randomizeTrees still runs unchanged (same draws) and
 * its pick for that class is then overwritten with the builder's pages.
 *
 * A partial shuffle (shuffleShare < 1, never with a build) keeps every class on its
 * own three vanilla pages instead, so its staying skills can sit in their vanilla slots.
 */
export function runPlacement(
  rng: SeededRNG,
  input: {
    treePages: Map<string, TreePage>;
    skills: SkillEntry[];
    excludeSkills?: Set<string>;
    /** Hand-built classes (Class Builder): each keeps its placements and pages. */
    build?: { classes: readonly { fixed: FixedClass; pages: TreePage[] }[] };
    /** From shuffleShareOf (src/lib/shuffle-amount.ts); undefined is a full shuffle. */
    shuffleShare?: number;
    /**
     * The classes to shuffle (activeClassDefs). Absent is all eight. A base-game mod
     * passes the original seven: the Warlock gets no pages and its skills stay out of
     * the pool, so its rows keep their vanilla place in skills.txt.
     */
    classes?: readonly ClassDef[];
  },
) {
  const partial = input.shuffleShare !== undefined && input.shuffleShare < 1;
  if (partial && input.build) throw new Error('A partial shuffle cannot be combined with a Class Builder build');
  const classes = input.classes ?? CLASS_DEFS;
  const subset = classes.length !== CLASS_DEFS.length;
  const active = new Set<string>(classes.map(c => c.code));
  if (input.build?.classes.some(c => !active.has(c.fixed.classCode))) {
    throw new Error('The build includes a class this mod leaves out');
  }
  const treeAssignments: Map<ClassCode, TreePage[]> = partial
    ? vanillaTrees(input.treePages, classes)
    : randomizeTrees(rng, input.treePages, classes);
  for (const c of input.build?.classes ?? []) treeAssignments.set(c.fixed.classCode, c.pages);
  const opts = {
    ...(input.excludeSkills && input.excludeSkills.size > 0 ? { excludeSkills: input.excludeSkills } : {}),
    // A single class is passed as before (identical draws); several as a list.
    ...(input.build ? { fixed: input.build.classes.length === 1 ? input.build.classes[0].fixed : input.build.classes.map(c => c.fixed) } : {}),
    ...(partial ? { shuffleShare: input.shuffleShare } : {}),
    ...(subset ? { classes } : {}),
  };
  const skills = subset ? input.skills.filter(s => active.has(s.charclass)) : input.skills;
  const placed = placeSkills(rng, skills, treeAssignments, Object.keys(opts).length > 0 ? opts : undefined);
  return { treeAssignments, ...placed };
}

/** Every class on its own pages, tree 1 → tab 1, as in the vanilla game. */
function vanillaTrees(treePages: Map<string, TreePage>, classes: readonly ClassDef[]): Map<ClassCode, TreePage[]> {
  return new Map(classes.map(def => [def.code, [1, 2, 3].map(t => {
    const page = treePages.get(`${def.code}-${t}`);
    if (!page) throw new Error(`Missing tree page ${def.code}-${t}`);
    return page;
  })]));
}
