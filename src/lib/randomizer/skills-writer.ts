import { ClassCode, SkillPlacement } from './types';
import { getColumnIndex } from '../data-loader';
import { CLASS_BY_CODE, CLASS_NATURAL_WEAPON, CLASS_RESTRICTED_TYPES } from './config';
import { PrereqAssignment } from './prereq-assigner';

// Column indices in skills.txt (0-based)
const COL = {
  skill: 0,
  id: 1,
  charclass: 2,
  skilldesc: 3,
  reqskill1: 161,
  reqskill2: 162,
  reqskill3: 163,
  DmgSymPerCalc: 237,
  EDmgSymPerCalc: 251,
  ELenSymPerCalc: 256,
  passiveitype: 49,
  itypea1: 136,
  itypea2: 137,
  itypea3: 138,
  itypeb1: 141,
};

/**
 * Modify skills.txt rows based on placements:
 * - Update charclass to new class
 * - Clear reqskill1/2/3 (tree structure is randomized)
 * - Update synergy formula columns
 */
export function writeSkillsRows(
  headers: string[],
  rows: string[][],
  placements: SkillPlacement[],
  synergyUpdates: Map<string, { EDmgSymPerCalc?: string; ELenSymPerCalc?: string; DmgSymPerCalc?: string }>,
  prereqAssignments: Map<string, PrereqAssignment>,
  logic: 'minimal' | 'normal' = 'minimal',
): void {
  // Build lookup: skill name → placement
  const skillToPlacement = new Map<string, SkillPlacement>();
  for (const p of placements) {
    skillToPlacement.set(p.skill.skill, p);
  }

  // Row number → required level mapping
  const ROW_TO_LEVEL: Record<number, number> = { 1: 1, 2: 6, 3: 12, 4: 18, 5: 24, 6: 30 };

  // Resolve column indices dynamically (fallback to hardcoded)
  const charclassIdx = safeGetCol(headers, 'charclass', COL.charclass);
  const reqlevelIdx = safeGetCol(headers, 'reqlevel', 174);
  const reqskill1Idx = safeGetCol(headers, 'reqskill1', COL.reqskill1);
  const reqskill2Idx = safeGetCol(headers, 'reqskill2', COL.reqskill2);
  const reqskill3Idx = safeGetCol(headers, 'reqskill3', COL.reqskill3);
  const dmgSymIdx = safeGetCol(headers, 'DmgSymPerCalc', COL.DmgSymPerCalc);
  const edmgSymIdx = safeGetCol(headers, 'EDmgSymPerCalc', COL.EDmgSymPerCalc);
  const elenSymIdx = safeGetCol(headers, 'ELenSymPerCalc', COL.ELenSymPerCalc);
  const passiveitypeIdx = safeGetCol(headers, 'passiveitype', COL.passiveitype);
  const itypea1Idx = safeGetCol(headers, 'itypea1', COL.itypea1);
  const itypea2Idx = safeGetCol(headers, 'itypea2', COL.itypea2);
  const itypea3Idx = safeGetCol(headers, 'itypea3', COL.itypea3);
  const itypeb1Idx = safeGetCol(headers, 'itypeb1', COL.itypeb1);

  for (const row of rows) {
    const skillName = row[0]; // skill column is always first
    const placement = skillToPlacement.get(skillName);
    if (!placement) continue;

    const classDef = CLASS_BY_CODE.get(placement.targetClass);
    if (!classDef) continue;

    // Update charclass
    row[charclassIdx] = classDef.charclass;

    // Clear weapon type requirements for skills moved to a new class so they always
    // appear in the skill select bar and can be used with any weapon.
    // Pinned skills that stay on their original class keep their requirements intact.
    if (placement.targetClass !== placement.skill.charclass) {
      for (const idx of [itypea1Idx, itypea2Idx, itypea3Idx]) {
        if (row[idx] && row[idx] !== 'xx') {
          row[idx] = '';
        }
      }
    }

    // Update reqlevel to match the assigned row
    const newLevel = ROW_TO_LEVEL[placement.row] ?? 1;
    row[reqlevelIdx] = String(newLevel);

    // Assign prerequisites based on grid position
    const prereq = prereqAssignments.get(skillName);
    row[reqskill1Idx] = prereq?.reqskill1 || '';
    row[reqskill2Idx] = prereq?.reqskill2 || '';
    row[reqskill3Idx] = '';

    // Update synergy formulas
    const syn = synergyUpdates.get(skillName);
    if (syn) {
      if (syn.DmgSymPerCalc !== undefined) row[dmgSymIdx] = syn.DmgSymPerCalc;
      if (syn.EDmgSymPerCalc !== undefined) row[edmgSymIdx] = syn.EDmgSymPerCalc;
      if (syn.ELenSymPerCalc !== undefined) row[elenSymIdx] = syn.ELenSymPerCalc;
    }

    // Normal Logic: remap class-restricted weapon types to the target class's natural weapon
    if (logic === 'normal') {
      const naturalWeapon = CLASS_NATURAL_WEAPON[placement.targetClass];
      if (naturalWeapon) {
        if (CLASS_RESTRICTED_TYPES.has(row[passiveitypeIdx])) {
          row[passiveitypeIdx] = naturalWeapon;
        }
        for (const idx of [itypea1Idx, itypea2Idx, itypea3Idx, itypeb1Idx]) {
          if (CLASS_RESTRICTED_TYPES.has(row[idx])) {
            row[idx] = naturalWeapon;
          }
        }
      }
    }
  }
}

function safeGetCol(headers: string[], name: string, fallback: number): number {
  const idx = headers.indexOf(name);
  return idx !== -1 ? idx : fallback;
}
