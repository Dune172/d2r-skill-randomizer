import { ClassCode, SkillPlacement } from './types';

export interface PrereqAssignment {
  reqskill1: string;
  reqskill2: string;
}

/**
 * Arrow topology for each tree page, derived from original game data.
 * Key: "classCode-treeIndex" (e.g. "ama-1")
 * Value: array of [targetRow, targetCol, reqRow1, reqCol1, reqRow2?, reqCol2?]
 * Each entry means: the skill at (targetRow, targetCol) requires skills at the listed positions.
 */
type ArrowDef = [number, number, number, number, number?, number?];

const TREE_ARROWS: Record<string, ArrowDef[]> = {
  'ama-1': [
    [2, 2, 1, 2],
    [3, 3, 1, 3, 2, 2],
    [4, 1, 2, 1],
    [4, 2, 2, 1, 2, 2],
    [5, 2, 4, 2],
    [5, 3, 3, 3],
    [6, 1, 4, 1],
  ],
  'ama-2': [
    [3, 1, 1, 1],
    [3, 2, 2, 2],
    [4, 3, 1, 3],
    [5, 1, 3, 1],
    [5, 2, 3, 2],
    [6, 1, 5, 1, 5, 2],
    [6, 3, 4, 3],
  ],
  'ama-3': [
    [2, 2, 1, 1],
    [3, 1, 1, 1],
    [3, 3, 2, 3],
    [4, 2, 2, 2, 3, 3],
    [4, 3, 3, 3],
    [5, 1, 3, 1],
    [6, 2, 4, 2],
    [6, 3, 4, 3],
  ],
  'sor-1': [
    [3, 1, 2, 1],
    [3, 2, 1, 2],
    [4, 1, 3, 1],
    [4, 3, 1, 3, 3, 2],
    [5, 2, 3, 2, 4, 1],
    [6, 3, 4, 3],
  ],
  'sor-2': [
    [3, 1, 2, 1],
    [3, 2, 1, 2],
    [4, 2, 3, 2],
    [4, 3, 2, 3],
    [5, 1, 3, 1, 4, 2],
    [5, 3, 4, 3, 4, 2],
  ],
  'sor-3': [
    [2, 2, 1, 2],
    [3, 3, 2, 2, 1, 3],
    [4, 2, 2, 2],
    [5, 1, 2, 1, 4, 2],
    [5, 3, 3, 3],
    [6, 1, 5, 1],
  ],
  'nec-1': [
    [2, 3, 1, 2],
    [3, 2, 1, 2],
    [3, 3, 2, 3],
    [4, 1, 2, 1],
    [4, 2, 3, 2],
    [5, 1, 4, 1],
    [5, 3, 3, 3],
    [6, 2, 4, 2, 5, 3],
  ],
  'nec-2': [
    [2, 2, 1, 2],
    [3, 3, 1, 3],
    [4, 1, 2, 1, 2, 2],
    [4, 2, 2, 2],
    [5, 3, 3, 3, 4, 2],
    [6, 1, 4, 1],
    [6, 2, 4, 2],
  ],
  'nec-3': [
    [1, 1, 1, 3],
    [3, 1, 2, 2],
    [3, 3, 1, 3],
    [4, 2, 2, 2],
    [5, 1, 3, 1],
    [5, 2, 4, 2],
    [6, 2, 5, 2],
    [6, 3, 3, 3, 5, 2],
  ],
  'pal-1': [
    [3, 1, 1, 1],
    [3, 3, 1, 3],
    [4, 1, 3, 1],
    [4, 2, 2, 2],
    [5, 1, 4, 1],
    [5, 3, 3, 3, 4, 2],
    [6, 2, 4, 2, 5, 1],
  ],
  'pal-2': [
    [2, 2, 1, 1],
    [3, 1, 1, 1],
    [4, 1, 3, 1],
    [4, 2, 2, 2],
    [5, 2, 4, 2],
    [5, 3, 2, 3, 4, 2],
    [6, 1, 4, 1],
    [6, 3, 5, 3],
  ],
  'pal-3': [
    [3, 1, 1, 1],
    [4, 2, 3, 1, 2, 2],
    [5, 1, 3, 1],
    [6, 2, 4, 2],
  ],
  'bar-1': [
    [2, 3, 1, 2],
    [3, 2, 1, 2],
    [3, 3, 2, 3],
    [4, 1, 2, 1],
    [4, 2, 3, 2],
    [5, 3, 3, 3],
    [6, 1, 4, 1, 4, 2],
    [6, 2, 4, 2],
  ],
  'bar-2': [
    [5, 1, 3, 1],
    [6, 3, 4, 3],
  ],
  'bar-3': [
    [2, 1, 1, 1],
    [2, 2, 1, 1],
    [3, 3, 1, 3],
    [4, 1, 2, 1],
    [5, 2, 2, 2],
    [5, 3, 3, 3],
    [6, 1, 4, 1, 5, 2],
    [6, 2, 5, 2],
  ],
  'dru-1': [
    [2, 2, 1, 2],
    [3, 3, 1, 3],
    [4, 1, 2, 1],
    [4, 2, 2, 1, 2, 2],
    [5, 3, 3, 3],
    [6, 1, 4, 1],
    [6, 2, 4, 2],
  ],
  'dru-2': [
    [1, 2, 1, 1],
    [3, 1, 1, 1],
    [3, 3, 2, 3],
    [4, 1, 3, 1],
    [4, 2, 3, 1, 3, 3],
    [5, 2, 4, 2],
    [5, 3, 3, 3],
    [6, 1, 4, 1],
  ],
  'dru-3': [
    [2, 1, 1, 1],
    [3, 1, 2, 1],
    [3, 3, 2, 3],
    [4, 2, 3, 3],
    [5, 1, 3, 1],
    [5, 2, 4, 2],
    [6, 1, 5, 1],
    [6, 2, 5, 2],
  ],
  'ass-1': [
    [2, 1, 1, 2],
    [3, 1, 2, 1],
    [3, 2, 1, 2],
    [4, 3, 2, 3, 3, 2],
    [5, 1, 3, 1],
    [5, 2, 3, 2],
    [6, 1, 5, 1],
    [6, 3, 4, 3],
  ],
  'ass-2': [
    [2, 1, 1, 2],
    [3, 2, 1, 2],
    [3, 3, 1, 3],
    [4, 1, 2, 1],
    [4, 2, 3, 3, 3, 2],
    [5, 3, 3, 3],
    [6, 1, 4, 1],
    [6, 2, 4, 2],
  ],
  'ass-3': [
    [2, 3, 1, 3],
    [3, 2, 1, 2],
    [4, 1, 2, 1],
    [4, 3, 2, 3],
    [5, 1, 4, 1],
    [5, 3, 4, 3],
    [6, 2, 3, 2, 5, 1],
  ],
  'war-1': [
    [1, 1, 1, 3],
    [2, 1, 1, 1],
    [2, 2, 1, 3],
    [3, 3, 1, 3],
    [4, 2, 2, 2],
    [4, 3, 3, 3],
    [5, 2, 4, 2],
    [6, 1, 2, 1],
    [6, 3, 5, 2, 4, 3],
  ],
  'war-2': [
    [2, 2, 1, 1],
    [3, 1, 1, 1],
    [3, 3, 1, 3],
    [4, 1, 3, 1],
    [4, 2, 2, 2],
    [5, 2, 4, 2],
    [5, 3, 3, 3],
    [6, 2, 4, 1, 5, 2],
  ],
  'war-3': [
    [3, 2, 2, 2],
    [3, 3, 1, 3],
    [4, 1, 2, 1],
    [5, 2, 3, 2],
    [5, 3, 3, 3],
    [6, 1, 4, 1, 5, 2],
    [6, 3, 5, 3],
  ],
};

/**
 * Assign prerequisites based on the arrow topology of each tree page.
 * Each tree sprite has arrows painted on it showing prerequisite connections.
 * We look up the tree page assigned to each tab and apply its arrow pattern
 * to the skills placed in those grid positions.
 */
export function assignPrerequisites(
  placements: SkillPlacement[],
  placementsByClass: Map<ClassCode, SkillPlacement[]>,
): Map<string, PrereqAssignment> {
  const assignments = new Map<string, PrereqAssignment>();

  for (const [, classPlacements] of placementsByClass.entries()) {
    // Build position lookup: "tabIndex-row-col" → skill name
    const posToSkill = new Map<string, string>();
    for (const p of classPlacements) {
      posToSkill.set(`${p.tabIndex}-${p.row}-${p.col}`, p.skill.skill);
    }

    for (const p of classPlacements) {
      const treeKey = `${p.treePage.classCode}-${p.treePage.treeIndex}`;
      const arrows = TREE_ARROWS[treeKey] || [];

      // Find the arrow definition for this position
      const arrow = arrows.find(a => a[0] === p.row && a[1] === p.col);

      if (!arrow) {
        // No arrows point to this position — no prerequisites
        assignments.set(p.skill.skill, { reqskill1: '', reqskill2: '' });
        continue;
      }

      // Look up the skills at the required positions (same tab)
      const req1 = posToSkill.get(`${p.tabIndex}-${arrow[2]}-${arrow[3]}`) || '';
      const req2 = (arrow[4] !== undefined && arrow[5] !== undefined)
        ? posToSkill.get(`${p.tabIndex}-${arrow[4]}-${arrow[5]}`) || ''
        : '';

      assignments.set(p.skill.skill, { reqskill1: req1, reqskill2: req2 });
    }
  }

  return assignments;
}
