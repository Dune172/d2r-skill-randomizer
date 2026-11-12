import { ClassCode, ClassDef, TreePage } from './types';
import { SeededRNG } from './seed';
import { CLASS_DEFS, SPRITE_CLASSES } from './config';

// Determinism notice: tree pool construction and shuffle order both feed the
// RNG. Changing SPRITE_CLASSES membership/order or the pool-build logic below
// shifts seeds. Bump PIPELINE_VERSION in ./pipeline-version.ts if you edit
// this file's RNG-consuming logic.

/**
 * Assign 3 tree pages per class from the pool of available tree pages.
 * Tree index is preserved: tab 1 gets a tree-1 page, tab 2 gets a tree-2 page, etc.
 * Pool: every active sprite class × 3 trees each. Allow reuse across classes.
 * `classDefs` defaults to all eight; a base-game mod passes the original seven, which
 * also keeps the Warlock's pages out of the pool.
 */
export function randomizeTrees(
  rng: SeededRNG,
  treePages: Map<string, TreePage>,
  classDefs: readonly ClassDef[] = CLASS_DEFS,
): Map<ClassCode, TreePage[]> {
  // Build separate pools for each tree index (1, 2, 3)
  const pools: string[][] = [[], [], []];
  const active = new Set(classDefs.map(d => d.code));
  for (const classCode of SPRITE_CLASSES.filter(c => active.has(c))) {
    for (let tree = 1; tree <= 3; tree++) {
      const key = `${classCode}-${tree}`;
      if (treePages.has(key)) {
        pools[tree - 1].push(key);
      }
    }
  }

  const assignments = new Map<ClassCode, TreePage[]>();

  for (const classDef of classDefs) {
    const classCode = classDef.code;
    const selected: string[] = [];

    // Pick one page from each tree pool (tree 1 → tab 1, tree 2 → tab 2, tree 3 → tab 3)
    for (let t = 0; t < 3; t++) {
      const pool = pools[t];
      const idx = rng.randInt(0, pool.length - 1);
      selected.push(pool[idx]);
    }

    assignments.set(
      classCode,
      selected.map(key => treePages.get(key)!),
    );
  }

  return assignments;
}
