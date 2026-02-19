import { ClassCode, SkillPlacement } from './types';
import { getColumnIndex } from '../data-loader';
import { CLASS_BY_CODE } from './config';

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

  for (const row of rows) {
    const skillName = row[0]; // skill column is always first
    const placement = skillToPlacement.get(skillName);
    if (!placement) continue;

    const classDef = CLASS_BY_CODE.get(placement.targetClass);
    if (!classDef) continue;

    // Update charclass
    row[charclassIdx] = classDef.charclass;

    // Update reqlevel to match the assigned row
    const newLevel = ROW_TO_LEVEL[placement.row] ?? 1;
    row[reqlevelIdx] = String(newLevel);

    // Clear prerequisites (tree structure is randomized)
    row[reqskill1Idx] = '';
    row[reqskill2Idx] = '';
    row[reqskill3Idx] = '';

    // Update synergy formulas
    const syn = synergyUpdates.get(skillName);
    if (syn) {
      if (syn.DmgSymPerCalc !== undefined) row[dmgSymIdx] = syn.DmgSymPerCalc;
      if (syn.EDmgSymPerCalc !== undefined) row[edmgSymIdx] = syn.EDmgSymPerCalc;
      if (syn.ELenSymPerCalc !== undefined) row[elenSymIdx] = syn.ELenSymPerCalc;
    }
  }
}

function safeGetCol(headers: string[], name: string, fallback: number): number {
  const idx = headers.indexOf(name);
  return idx !== -1 ? idx : fallback;
}
