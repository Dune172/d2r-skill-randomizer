import { ClassCode, SkillPlacement } from './types';
import { SeededRNG } from './seed';

/**
 * For each skill, find which other skills are now in the same class,
 * and remap synergy references to point to co-located skills.
 */

/**
 * Update skills.txt synergy formulas.
 * Columns: EDmgSymPerCalc, ELenSymPerCalc, DmgSymPerCalc
 * Format: skill('Fire Bolt'.blvl) → replace skill names with co-located skills
 */
export function updateSkillsSynergies(
  placements: SkillPlacement[],
  placementsByClass: Map<ClassCode, SkillPlacement[]>,
  rng: SeededRNG,
): Map<string, { EDmgSymPerCalc?: string; ELenSymPerCalc?: string; DmgSymPerCalc?: string }> {
  const updates = new Map<string, { EDmgSymPerCalc?: string; ELenSymPerCalc?: string; DmgSymPerCalc?: string }>();

  // Build lookup: skill name → placement
  const skillToPlacement = new Map<string, SkillPlacement>();
  for (const p of placements) {
    skillToPlacement.set(p.skill.skill, p);
  }

  const synergyRegex = /skill\('([^']+)'\.blvl\)/g;

  for (const placement of placements) {
    const skill = placement.skill;
    const classmates = placementsByClass.get(placement.targetClass) || [];
    // Get other skills in the same class (excluding self)
    const otherClassmates = classmates.filter(p => p.skill.skill !== skill.skill);

    const result: { EDmgSymPerCalc?: string; ELenSymPerCalc?: string; DmgSymPerCalc?: string } = {};
    let hasUpdate = false;

    for (const col of ['EDmgSymPerCalc', 'ELenSymPerCalc', 'DmgSymPerCalc'] as const) {
      const formulaRaw = skill[col];
      if (!formulaRaw) continue;
      const formula = String(formulaRaw);
      if (!formula.includes("skill('")) continue;

      // Find all skill references in this formula
      const matches = [...formula.matchAll(synergyRegex)];
      if (matches.length === 0) continue;

      let newFormula = formula;
      // For each referenced skill, replace with a random classmate
      const usedClassmates = new Set<string>();

      for (const match of matches) {
        const refSkillName = match[1];
        // Pick a classmate that hasn't been used yet in this formula
        const available = otherClassmates.filter(p => !usedClassmates.has(p.skill.skill));
        if (available.length === 0) continue;

        const replacement = available[rng.randInt(0, available.length - 1)];
        usedClassmates.add(replacement.skill.skill);
        newFormula = newFormula.replace(
          `skill('${refSkillName}'.blvl)`,
          `skill('${replacement.skill.skill}'.blvl)`,
        );
      }

      result[col] = newFormula;
      hasUpdate = true;
    }

    if (hasUpdate) {
      updates.set(skill.skill, result);
    }
  }

  return updates;
}

/**
 * Update skilldesc.txt dsc3textb columns.
 * These reference str name values from other skills' skilldesc entries.
 * Replace with str name values of skills now in the same class.
 */
export function updateSkillDescSynergies(
  placements: SkillPlacement[],
  placementsByClass: Map<ClassCode, SkillPlacement[]>,
  skillDescStrNames: Map<string, string>, // skilldesc name → str name
  skillDescEntries: Map<string, { dsc3textb: string[] }>, // skilldesc name → original dsc3textb
  rng: SeededRNG,
): Map<string, string[]> {
  // Returns: skill name → new dsc3textb values (same count as original)
  const updates = new Map<string, string[]>();

  for (const placement of placements) {
    const skill = placement.skill;
    const skilldescName = skill.skilldesc;
    if (!skilldescName) continue;

    // Get original synergy count from dsc3textb.
    // Subtract 1 because dsc3textb[0] is a self-reference (header), not a synergy entry.
    const descEntry = skillDescEntries.get(skilldescName);
    if (!descEntry || descEntry.dsc3textb.length <= 1) continue;

    const originalCount = descEntry.dsc3textb.length - 1;

    const classmates = placementsByClass.get(placement.targetClass) || [];
    const otherClassmates = classmates.filter(p => p.skill.skill !== skill.skill);

    if (otherClassmates.length === 0) continue;

    // Pick the same number of classmates as the original synergy count
    const synergyCount = Math.min(otherClassmates.length, originalCount);
    const shuffled = rng.shuffle(otherClassmates);
    const newTextBs = shuffled.slice(0, synergyCount).map(p => {
      const sd = p.skill.skilldesc;
      return skillDescStrNames.get(sd) || '';
    }).filter(s => s !== '');

    if (newTextBs.length > 0) {
      updates.set(skill.skill, newTextBs);
    }
  }

  return updates;
}
