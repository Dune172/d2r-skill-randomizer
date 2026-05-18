import { ClassCode, SkillPlacement } from './types';
import { SeededRNG } from './seed';

// Determinism notice: this module consumes RNG for synergy substitutions.
// Any change to which skills are candidate targets, the iteration order, or
// the formula-rewrite logic will shift seeds. Bump PIPELINE_VERSION in
// ./pipeline-version.ts if you edit the RNG-consuming paths below.

/**
 * For each skill, find which other skills are now in the same class,
 * and remap synergy references to point to co-located skills.
 *
 * `skill('X'.blvl)` references can appear in many skills.txt columns
 * (calc1-10, auralencalc, aurastatcalc1-6, passivecalc1-14, sumskNcalc,
 * prgcalc1, ToHitCalc, DmgSymPerCalc, EDmgSymPerCalc, ELenSymPerCalc,
 * etc.), so the remap scans every cell of each row rather than a
 * whitelist of column names.
 */

const SYNERGY_REGEX = /skill\('([^']+)'\.blvl\)/g;

/**
 * Scan every cell in each placed skill's row for `skill('X'.blvl)`
 * references and replace them with co-located classmates. Rows are
 * mutated in place.
 *
 * Returns a map of skill name → ordered list of unique substituted
 * classmate names (first-occurrence order across the row). The caller
 * feeds this into the skilldesc display updater so UI synergy lines
 * name the same skills that drive the formula.
 */
export function updateSkillsSynergies(
  rows: string[][],
  placements: SkillPlacement[],
  placementsByClass: Map<ClassCode, SkillPlacement[]>,
  rng: SeededRNG,
): Map<string, string[]> {
  const substitutions = new Map<string, string[]>();

  // Pre-compute per-skill "other classmates" list once
  const otherClassmatesBySkill = new Map<string, SkillPlacement[]>();
  for (const classmates of placementsByClass.values()) {
    for (const p of classmates) {
      otherClassmatesBySkill.set(p.skill.skill, classmates.filter(c => c !== p));
    }
  }

  // skill name → row lookup
  const rowBySkill = new Map<string, string[]>();
  for (const row of rows) {
    if (row[0]) rowBySkill.set(row[0], row);
  }

  for (const placement of placements) {
    const skillName = placement.skill.skill;
    const row = rowBySkill.get(skillName);
    if (!row) continue;
    const otherClassmates = otherClassmatesBySkill.get(skillName) ?? [];

    // Allocation state shared across all cells in this row so a given
    // classmate isn't used twice anywhere in the skill, and the
    // 1-cross-tab cap applies to the whole skill.
    const usedClassmates = new Set<string>();
    const chosenOrder: string[] = [];
    let crossTabUsed = 0;
    // Cache refSkillName → replacement so repeated references within/across
    // cells in the same row map consistently (needed for correctness when a
    // synergy formula and its display string both reference the same skill).
    const refToReplacement = new Map<string, string>();

    for (let col = 0; col < row.length; col++) {
      const cell = row[col];
      if (!cell || !cell.includes("skill('")) continue;

      const matches = [...cell.matchAll(SYNERGY_REGEX)];
      if (matches.length === 0) continue;

      let newCell = cell;
      for (const match of matches) {
        const refSkillName = match[1];

        let replacementName = refToReplacement.get(refSkillName);
        if (!replacementName) {
          const sameTabAvailable = otherClassmates.filter(
            p => !usedClassmates.has(p.skill.skill) && p.tabIndex === placement.tabIndex,
          );
          const otherTabAvailable = otherClassmates.filter(
            p => !usedClassmates.has(p.skill.skill) && p.tabIndex !== placement.tabIndex,
          );
          const available = sameTabAvailable.length > 0
            ? sameTabAvailable
            : crossTabUsed < 1 ? otherTabAvailable : [];
          if (available.length === 0) continue;

          const pick = available[rng.randInt(0, available.length - 1)];
          if (pick.tabIndex !== placement.tabIndex) crossTabUsed++;
          replacementName = pick.skill.skill;
          usedClassmates.add(replacementName);
          chosenOrder.push(replacementName);
          refToReplacement.set(refSkillName, replacementName);
        }

        newCell = newCell.replace(
          `skill('${refSkillName}'.blvl)`,
          `skill('${replacementName}'.blvl)`,
        );
      }

      row[col] = newCell;
    }

    if (chosenOrder.length > 0) {
      substitutions.set(skillName, chosenOrder);
    }
  }

  return substitutions;
}

/**
 * Update skilldesc.txt dsc3textb columns.
 * These reference str name values from other skills' skilldesc entries.
 *
 * Prefer using the skills actually substituted into the formula (so
 * UI synergy lines match what truly boosts damage). Falls back to a
 * random classmate pick for skills with no formula refs.
 */
export function updateSkillDescSynergies(
  placements: SkillPlacement[],
  placementsByClass: Map<ClassCode, SkillPlacement[]>,
  skillDescStrNames: Map<string, string>, // skilldesc name → str name
  skillDescEntries: Map<string, { dsc3textb: string[] }>, // skilldesc name → original dsc3textb
  formulaSubstitutions: Map<string, string[]>, // skill name → classmates used in formula (in order)
  skillByName: Map<string, { skilldesc: string }>,
  rng: SeededRNG,
): Map<string, string[]> {
  const updates = new Map<string, string[]>();

  for (const placement of placements) {
    const skill = placement.skill;
    const skilldescName = skill.skilldesc;
    if (!skilldescName) continue;

    const descEntry = skillDescEntries.get(skilldescName);
    if (!descEntry || descEntry.dsc3textb.length <= 1) continue;

    // dsc3textb[0] is a header/self-reference — actual synergies are the rest.
    const originalCount = descEntry.dsc3textb.length - 1;

    const formulaPicks = formulaSubstitutions.get(skill.skill);
    let chosenNames: string[] = [];

    if (formulaPicks && formulaPicks.length > 0) {
      // Use the skills actually substituted into the formula. De-dupe already
      // happened upstream (chosenOrder only appends new picks).
      chosenNames = formulaPicks.slice(0, Math.max(originalCount, formulaPicks.length));

      // Supplement with random classmates when there are fewer formula-caught
      // refs than display synergy slots (e.g. golems whose Golem Mastery refs
      // use .dm34/.ln56 rather than .blvl, but still occupy a display slot).
      if (chosenNames.length < originalCount) {
        const usedNames = new Set(chosenNames);
        const classmates = placementsByClass.get(placement.targetClass) || [];
        const remaining = classmates.filter(
          p => p.skill.skill !== skill.skill && !usedNames.has(p.skill.skill),
        );
        const needed = originalCount - chosenNames.length;
        const sameTab = rng.shuffle(remaining.filter(c => c.tabIndex === placement.tabIndex));
        const otherTab = rng.shuffle(remaining.filter(c => c.tabIndex !== placement.tabIndex));
        const supplement = [...sameTab, ...otherTab].slice(0, needed);
        chosenNames = [...chosenNames, ...supplement.map(p => p.skill.skill)];
      }
    } else {
      // No formula refs on this row → fall back to random classmates so
      // passive/aura skills with display-only synergy lines still look
      // plausible.
      const classmates = placementsByClass.get(placement.targetClass) || [];
      const otherClassmates = classmates.filter(p => p.skill.skill !== skill.skill);
      if (otherClassmates.length === 0) continue;

      const synergyCount = Math.min(otherClassmates.length, originalCount);
      const sameTab = rng.shuffle(otherClassmates.filter(c => c.tabIndex === placement.tabIndex));
      const otherTab = rng.shuffle(otherClassmates.filter(c => c.tabIndex !== placement.tabIndex));
      const selected = sameTab.slice(0, synergyCount);
      if (selected.length < synergyCount && otherTab.length > 0) {
        selected.push(otherTab[0]);
      }
      chosenNames = selected.map(p => p.skill.skill);
    }

    const newTextBs = chosenNames
      .map(name => {
        const info = skillByName.get(name);
        if (!info) return '';
        return skillDescStrNames.get(info.skilldesc) || '';
      })
      .filter(s => s !== '');

    if (newTextBs.length > 0) {
      updates.set(skill.skill, newTextBs);
    }
  }

  return updates;
}
