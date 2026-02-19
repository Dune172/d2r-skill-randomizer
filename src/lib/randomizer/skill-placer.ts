import { ClassCode, SkillEntry, SkillPlacement, TreePage } from './types';
import { SeededRNG } from './seed';
import { CLASS_DEFS } from './config';

/**
 * Shuffle all 240 class skills and assign them to FILLED grid slots
 * across all 8 classes' assigned tree pages.
 */
export function placeSkills(
  rng: SeededRNG,
  skills: SkillEntry[],
  treeAssignments: Map<ClassCode, TreePage[]>,
): SkillPlacement[] {
  // Shuffle all skills
  const shuffled = rng.shuffle(skills);
  const placements: SkillPlacement[] = [];
  let skillIdx = 0;

  for (const classDef of CLASS_DEFS) {
    const classCode = classDef.code;
    const trees = treeAssignments.get(classCode)!;
    let classSkillIndex = 0;

    for (let tabIndex = 0; tabIndex < trees.length; tabIndex++) {
      const tree = trees[tabIndex];
      // Get FILLED slots sorted by row then col
      const filledSlots = tree.slots
        .filter(s => s.status === 'FILLED')
        .sort((a, b) => a.row - b.row || a.col - b.col);

      for (const slot of filledSlots) {
        if (skillIdx >= shuffled.length) {
          console.warn(`Ran out of skills to place at class ${classCode}, tab ${tabIndex}`);
          break;
        }

        const skill = shuffled[skillIdx++];
        // IconCel: 0, 2, 4, ..., 58 (each skill uses 2 frames: normal + pressed)
        const iconCel = classSkillIndex * 2;

        placements.push({
          skill,
          targetClass: classCode,
          treePage: tree,
          tabIndex,
          row: slot.row,
          col: slot.col,
          iconCel,
          skillIndex: classSkillIndex,
        });

        classSkillIndex++;
      }
    }

    if (classSkillIndex < 30) {
      console.warn(`Class ${classCode} only got ${classSkillIndex} skills (expected ~30)`);
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
