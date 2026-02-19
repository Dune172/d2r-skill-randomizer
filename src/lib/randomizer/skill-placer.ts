import { ClassCode, SkillEntry, SkillPlacement, TreePage } from './types';
import { SeededRNG } from './seed';
import { CLASS_DEFS } from './config';

/**
 * Shuffle all 240 class skills and assign them to FILLED grid slots
 * across all 8 classes' assigned tree pages.
 * Skills are sorted by reqlevel within each class so that lower-level
 * skills land in earlier rows (row 1 = level 1, row 2 = level 6, etc.)
 */
export function placeSkills(
  rng: SeededRNG,
  skills: SkillEntry[],
  treeAssignments: Map<ClassCode, TreePage[]>,
): SkillPlacement[] {
  // Shuffle all skills
  const shuffled = rng.shuffle(skills);
  const placements: SkillPlacement[] = [];

  // First pass: count how many slots each class needs
  const classSlotsCount: number[] = [];
  for (const classDef of CLASS_DEFS) {
    const trees = treeAssignments.get(classDef.code)!;
    let count = 0;
    for (const tree of trees) {
      count += tree.slots.filter(s => s.status === 'FILLED').length;
    }
    classSlotsCount.push(count);
  }

  // Distribute shuffled skills to each class, then sort by reqlevel within each class
  let skillIdx = 0;
  for (let ci = 0; ci < CLASS_DEFS.length; ci++) {
    const classDef = CLASS_DEFS[ci];
    const classCode = classDef.code;
    const trees = treeAssignments.get(classCode)!;
    const slotCount = classSlotsCount[ci];

    // Take this class's share of shuffled skills
    const classSkills = shuffled.slice(skillIdx, skillIdx + slotCount);
    skillIdx += slotCount;

    // Sort by reqlevel so lowest-level skills go in earliest rows
    classSkills.sort((a, b) => a.reqlevel - b.reqlevel);

    // Collect all FILLED slots across all 3 tabs, sorted by tab then row then col
    const allSlots: { tabIndex: number; tree: TreePage; row: number; col: number }[] = [];
    for (let tabIndex = 0; tabIndex < trees.length; tabIndex++) {
      const tree = trees[tabIndex];
      const filledSlots = tree.slots
        .filter(s => s.status === 'FILLED')
        .sort((a, b) => a.row - b.row || a.col - b.col);
      for (const slot of filledSlots) {
        allSlots.push({ tabIndex, tree, row: slot.row, col: slot.col });
      }
    }

    // Sort all slots by row first (across all tabs), then by tab, then by col
    allSlots.sort((a, b) => a.row - b.row || a.tabIndex - b.tabIndex || a.col - b.col);

    // Assign sorted skills to sorted slots
    for (let i = 0; i < classSkills.length && i < allSlots.length; i++) {
      const skill = classSkills[i];
      const slot = allSlots[i];
      const classSkillIndex = i;
      const iconCel = classSkillIndex * 2;

      placements.push({
        skill,
        targetClass: classCode,
        treePage: slot.tree,
        tabIndex: slot.tabIndex,
        row: slot.row,
        col: slot.col,
        iconCel,
        skillIndex: classSkillIndex,
      });
    }

    if (classSkills.length < 30) {
      console.warn(`Class ${classCode} only got ${classSkills.length} skills (expected ~30)`);
    }
  }

  if (skillIdx < shuffled.length) {
    console.warn(`${shuffled.length - skillIdx} skills were not placed`);
  }

  return placements;
}

/**
 * Group placements by target class
 */
export function groupByClass(
  placements: SkillPlacement[],
): Map<ClassCode, SkillPlacement[]> {
  const map = new Map<ClassCode, SkillPlacement[]>();
  for (const p of placements) {
    if (!map.has(p.targetClass)) {
      map.set(p.targetClass, []);
    }
    map.get(p.targetClass)!.push(p);
  }
  return map;
}
