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
 * `skill('X'.<field>)` references can appear in many skills.txt columns
 * (calc1-10, auralencalc, aurastatcalc1-6, passivecalc1-14, sumskNcalc,
 * prgcalc1, ToHitCalc, DmgSymPerCalc, EDmgSymPerCalc, ELenSymPerCalc,
 * etc.), so the remap scans every cell of each row rather than a
 * whitelist of column names. The same applies to skilldesc.txt, which
 * carries its own copy of many damage formulas (ddam calc1/2,
 * desccalca/b1-6, dsc2calca/b1-5, dsc3calca/b1-7).
 *
 * Only LEVEL references are remapped — `.blvl` (base level) and `.lvl`.
 * Those read how many points the player sank into the synergy skill, which
 * is exactly what has to follow the skill to its new class.
 *
 * Coefficient references are deliberately left pointing at the original
 * skill: `.parN`, `.lnNN`, `.dmNN`, `.paNN`, `.edmn`, `.clcN` read static
 * balance numbers off the referenced row, not player investment. Leaving
 * them alone is what preserves balance — Revive's
 *   `par1 + skill('Skeleton Mastery'.lvl) * skill('Skeleton Mastery'.par3)`
 * correctly becomes
 *   `par1 + skill('<classmate>'.lvl) * skill('Skeleton Mastery'.par3)`
 * i.e. the new skill's level times Skeleton Mastery's per-level coefficient.
 */

const SYNERGY_REGEX = /skill\('([^']+)'\.(blvl|lvl)\)/g;

/** What updateSkillsSynergies resolved for one placed skill. */
export interface SynergySubstitution {
  /** original referenced skill name → replacement classmate name. */
  refToReplacement: Map<string, string>;
  /** Unique replacements in first-occurrence order across the row. */
  chosenOrder: string[];
}

/**
 * Scan every cell in each placed skill's rows (skills.txt, the skilldesc.txt
 * row behind it, and any non-placed pet rows it summons) for level references
 * and replace them with co-located classmates. Rows are mutated in place.
 *
 * All three row sets share one allocation state per skill, so a formula in
 * skills.txt and its mirror in skilldesc.txt resolve the same original ref to
 * the same replacement — without that, the tooltip's Damage % line keeps
 * scaling off the pre-shuffle synergy skill (level 0 once it moves class)
 * while the server-side damage scales off the new one.
 *
 * Returns a map of skill name → SynergySubstitution. The caller feeds this
 * into the skilldesc display updater so UI synergy lines name the same skills
 * that drive the formula.
 */
export function updateSkillsSynergies(
  rows: string[][],
  placements: SkillPlacement[],
  placementsByClass: Map<ClassCode, SkillPlacement[]>,
  rng: SeededRNG,
  headers: string[],
  skillDescRows?: string[][],
): Map<string, SynergySubstitution> {
  const substitutions = new Map<string, SynergySubstitution>();

  // Pre-compute per-skill "other classmates" list once
  const otherClassmatesBySkill = new Map<string, SkillPlacement[]>();
  for (const classmates of placementsByClass.values()) {
    for (const p of classmates) {
      otherClassmatesBySkill.set(p.skill.skill, classmates.filter(c => c !== p));
    }
  }

  // skill name → row lookup. Includes non-placed pet rows (empty charclass)
  // such as Tainted Fire Ball, so summon pets can be reached by name below.
  const rowBySkill = new Map<string, string[]>();
  for (const row of rows) {
    if (row[0]) rowBySkill.set(row[0], row);
  }

  // skilldesc name → skilldesc.txt row (col 0 is the skilldesc name).
  const descRowByName = new Map<string, string[]>();
  if (skillDescRows) {
    for (const row of skillDescRows) {
      if (row[0]) descRowByName.set(row[0], row);
    }
  }

  // Summons grant their damage via pet skills listed in sumskill1..6. Those
  // pet skills have empty charclass, so they're never placed/shuffled and
  // their synergy formulas would otherwise keep dangling refs to the summon's
  // vanilla synergy skill (which the shuffle moved off-class). We remap those
  // pet rows alongside their summon below.
  const sumskillCols: number[] = [];
  for (let i = 1; i <= 6; i++) {
    const idx = headers.indexOf(`sumskill${i}`);
    if (idx !== -1) sumskillCols.push(idx);
  }
  const placedSkillNames = new Set(placements.map(p => p.skill.skill));
  const processedPetRows = new Set<string>();

  for (const placement of placements) {
    const skillName = placement.skill.skill;
    const row = rowBySkill.get(skillName);
    if (!row) continue;
    const otherClassmates = otherClassmatesBySkill.get(skillName) ?? [];

    // Allocation state shared across all cells in this row (and any pet rows
    // this summon grants, and its skilldesc row) so a given classmate isn't
    // used twice anywhere in the skill, the 1-cross-tab cap applies to the
    // whole skill, and a given original ref maps to one consistent replacement.
    const usedClassmates = new Set<string>();
    const chosenOrder: string[] = [];
    let crossTabUsed = 0;
    // Cache refSkillName → replacement so repeated references within/across
    // cells (and across the summon + its pet rows + its skilldesc row) map
    // consistently — required for the formula and its displayed value to
    // agree when both reference the same skill.
    const refToReplacement = new Map<string, string>();

    // Scan + rewrite every level ref in a row using the shared per-skill
    // allocation state above. Mutates the row in place.
    const remapRow = (target: string[]) => {
      for (let col = 0; col < target.length; col++) {
        const cell = target[col];
        if (!cell || !cell.includes("skill('")) continue;

        const matches = [...cell.matchAll(SYNERGY_REGEX)];
        if (matches.length === 0) continue;

        let newCell = cell;
        for (const match of matches) {
          const refSkillName = match[1];
          const refField = match[2];

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
            `skill('${refSkillName}'.${refField})`,
            `skill('${replacementName}'.${refField})`,
          );
        }

        target[col] = newCell;
      }
    };

    remapRow(row);

    // Also remap the non-placed pet skills this summon grants, so the pet's
    // actual damage synergy scales off (and the skilldesc updater can name) a
    // real co-located classmate. A pet skill's level synergy calc evaluates
    // against the owner's skill levels, so a classmate of the summon is the
    // correct target. Placed pet skills are skipped — they get remapped on
    // their own class. Pet rows are processed once.
    for (const col of sumskillCols) {
      const petName = row[col];
      if (!petName || placedSkillNames.has(petName) || processedPetRows.has(petName)) continue;
      const petRow = rowBySkill.get(petName);
      if (!petRow) continue;
      processedPetRows.add(petName);
      remapRow(petRow);
    }

    // Finally the skilldesc.txt row, which mirrors many of these formulas in
    // its own display calcs. Remapped last and with the shared allocation
    // state, so refs it has in common with skills.txt resolve identically and
    // display-only refs still land on a real classmate.
    const descRow = descRowByName.get(placement.skill.skilldesc);
    if (descRow) remapRow(descRow);

    if (chosenOrder.length > 0) {
      substitutions.set(skillName, { refToReplacement, chosenOrder });
    }
  }

  return substitutions;
}

/**
 * Update skilldesc.txt dsc3textb columns — the "receives bonuses from:" list.
 * These hold str name values pointing at other skills' skilldesc entries.
 *
 * Keyed by the ORIGINAL str name in each slot rather than by slot position:
 * every slot is replaced with whatever the formula remap chose for the skill
 * that slot used to name. Position-based assignment silently mismatched lines
 * whenever a row's formula order differed from its dsc3 order — Vengeance
 * lists fire/cold/lightning/elemental across calc1-3 but declares them in a
 * different dsc3 order, so three of its four lines named a skill that did not
 * drive that line.
 *
 * Slot values are read from the live skilldesc.txt rows rather than from the
 * parsed skilldesc model. Substitution can CHAIN (a dropped skill's source is
 * itself picked from `placements`, which already contains earlier substitutes),
 * and the parsed model resolves a source through vanilla data, so for a chained
 * substitute it reports the wrong skill's slots. The row is always the truth.
 *
 * Slots whose original skill has no level ref in either row (golems, whose
 * Golem Mastery refs are `.dm34`/`.ln56` coefficient lookups) fall back to a
 * random classmate so the display line still names something real.
 *
 * Returns skill name → (original str name → new str name).
 */
export function updateSkillDescSynergies(
  placements: SkillPlacement[],
  placementsByClass: Map<ClassCode, SkillPlacement[]>,
  skillDescStrNames: Map<string, string>, // skilldesc name → str name
  skillDescTxt: { headers: string[]; rows: string[][] },
  formulaSubstitutions: Map<string, SynergySubstitution>, // skill name → formula remap
  skillByName: Map<string, { skilldesc: string }>,
  strNameToSkillName: Map<string, string>, // vanilla str name → skill name
  rng: SeededRNG,
): Map<string, Map<string, string>> {
  const updates = new Map<string, Map<string, string>>();

  const descRowByName = new Map<string, string[]>();
  for (const row of skillDescTxt.rows) {
    if (row[0]) descRowByName.set(row[0], row);
  }
  const dsc3LineIdx: number[] = [];
  const dsc3TextbIdx: number[] = [];
  for (let i = 1; i <= 7; i++) {
    dsc3LineIdx.push(skillDescTxt.headers.indexOf(`dsc3line${i}`));
    dsc3TextbIdx.push(skillDescTxt.headers.indexOf(`dsc3textb${i}`));
  }

  for (const placement of placements) {
    const skill = placement.skill;
    const skilldescName = skill.skilldesc;
    if (!skilldescName) continue;

    const descRow = descRowByName.get(skilldescName);
    if (!descRow) continue;

    // Non-header synergy slots, in row order. dsc3line "40" is the
    // "X receives bonuses from:" header, whose textb is a self-reference.
    const originalSlots: string[] = [];
    for (let i = 0; i < 7; i++) {
      const ti = dsc3TextbIdx[i];
      if (ti < 0 || ti >= descRow.length || !descRow[ti]) continue;
      if (dsc3LineIdx[i] >= 0 && descRow[dsc3LineIdx[i]] === '40') continue;
      originalSlots.push(descRow[ti]);
    }
    if (originalSlots.length === 0) continue;

    const sub = formulaSubstitutions.get(skill.skill);
    const mapping = new Map<string, string>();
    const usedNames = new Set<string>();
    const unresolved: string[] = [];

    const strNameFor = (name: string): string | undefined => {
      const info = skillByName.get(name);
      return info ? skillDescStrNames.get(info.skilldesc) : undefined;
    };

    for (const origStrName of originalSlots) {
      const origSkillName = strNameToSkillName.get(origStrName);
      const replacement = origSkillName
        ? sub?.refToReplacement.get(origSkillName)
        : undefined;
      const newStrName = replacement ? strNameFor(replacement) : undefined;

      if (replacement && newStrName) {
        mapping.set(origStrName, newStrName);
        usedNames.add(replacement);
      } else {
        unresolved.push(origStrName);
      }
    }

    // Fill display-only slots with classmates not already named above.
    if (unresolved.length > 0) {
      const classmates = placementsByClass.get(placement.targetClass) || [];
      const remaining = classmates.filter(
        p => p.skill.skill !== skill.skill && !usedNames.has(p.skill.skill),
      );
      const sameTab = rng.shuffle(remaining.filter(c => c.tabIndex === placement.tabIndex));
      const otherTab = rng.shuffle(remaining.filter(c => c.tabIndex !== placement.tabIndex));
      const pool = [...sameTab, ...otherTab];

      for (let i = 0; i < unresolved.length && i < pool.length; i++) {
        const pickName = pool[i].skill.skill;
        const newStrName = strNameFor(pickName);
        if (!newStrName) continue;
        mapping.set(unresolved[i], newStrName);
        usedNames.add(pickName);
      }
    }

    if (mapping.size > 0) {
      updates.set(skill.skill, mapping);
    }
  }

  return updates;
}
