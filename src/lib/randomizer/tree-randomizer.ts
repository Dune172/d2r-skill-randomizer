import { ClassCode, TreePage } from './types';
import { SeededRNG } from './seed';
import { CLASS_DEFS, SPRITE_CLASSES } from './config';

/**
 * Assign 3 tree pages per class from the pool of available tree pages.
 * Tree index is preserved: tab 1 gets a tree-1 page, tab 2 gets a tree-2 page, etc.
 * Pool: 7 sprite classes × 3 trees each (Warlock excluded - no sprites).
 * Allow reuse across classes.
 */
export function randomizeTrees(
  rng: SeededRNG,
  treePages: Map<string, TreePage>,
): Map<ClassCode, TreePage[]> {
  // Build separate pools for each tree index (1, 2, 3)
  const pools: string[][] = [[], [], []];
  for (const classCode of SPRITE_CLASSES) {
    for (let tree = 1; tree <= 3; tree++) {
      const key = `${classCode}-${tree}`;
      if (treePages.has(key)) {
        pools[tree - 1].push(key);
      }
    }
  }

  const assignments = new Map<ClassCode, TreePage[]>();

  for (const classDef of CLASS_DEFS) {
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
