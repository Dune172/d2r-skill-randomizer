import { ClassCode, TreePage } from './types';
import { SeededRNG } from './seed';
import { CLASS_DEFS, SPRITE_CLASSES } from './config';

/**
 * Assign 3 tree pages per class from the pool of 21 available tree pages.
 * Pool: 7 sprite classes × 3 trees each (Warlock excluded - no grid/sprite data).
 * Allow reuse across classes, but no duplicates within the same class.
 */
export function randomizeTrees(
  rng: SeededRNG,
  treePages: Map<string, TreePage>,
): Map<ClassCode, TreePage[]> {
  // Build pool of available tree page keys (only sprite classes)
  const pool: string[] = [];
  for (const classCode of SPRITE_CLASSES) {
    for (let tree = 1; tree <= 3; tree++) {
      const key = `${classCode}-${tree}`;
      if (treePages.has(key)) {
        pool.push(key);
      }
    }
  }

  const assignments = new Map<ClassCode, TreePage[]>();

  for (const classDef of CLASS_DEFS) {
    const classCode = classDef.code;
    const selected: string[] = [];

    // Pick 3 unique tree pages for this class
    while (selected.length < 3) {
      const idx = rng.randInt(0, pool.length - 1);
      const key = pool[idx];
      if (!selected.includes(key)) {
        selected.push(key);
      }
    }

    assignments.set(
      classCode,
      selected.map(key => treePages.get(key)!),
    );
  }

  return assignments;
}
