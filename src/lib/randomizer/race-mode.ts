import { ClassCode, SkillEntry, SkillPlacement } from './types';
import { CLASS_DEFS } from './config';
import { SkillSubstitute } from './skill-placer';
import { pickRaceClassIndex } from '../classes';

// Race Mode: exactly one class is the real, randomized, playable tree; the other seven
// become useless filler whose 30 skill slots are all the Paladin Prayer aura. This makes
// races fair — everyone on the same seed plays the same (deterministically chosen) class.
//
// Implementation reuses the substitute machinery from skill-placer / route.ts: a
// substitute keeps a dropped skill's row identity (name / *Id / skilldesc) but borrows
// another skill's mechanics + display name. By making Prayer the source for every skill
// on every non-race class, those classes end up showing 30 "Prayer" slots that behave
// like Prayer, while their original skill rows stay distinct rows in skills.txt.
//
// Mercenary skills are the exception. hireling.txt names its skills by skills.txt row
// (Jab, Fire Ball, Holy Freeze, …), so turning those rows into Prayer would hand every
// merc Prayer. Those rows keep their vanilla mechanics instead, and the route locks the
// filler-class slot they sit in (reqlevel 100) so the filler class stays unplayable.
// Cloning the rows for mercs isn't an option: missiles.txt resolves damage through the
// skill row by name (firearrow → "Fire Arrow"), so a clone would fire empty missiles.

// Seed → ClassCode. Shares pickRaceClassIndex with the client (src/lib/classes.ts) so the
// announced class name and the generated class can't drift. CLASS_DEFS order mirrors
// CLASS_NAMES order.
export function pickRaceClassCode(seed: number): ClassCode {
  return CLASS_DEFS[pickRaceClassIndex(seed)].code;
}

// Required level that no character can reach — keeps a merc skill left on a filler class
// out of player hands while mercs (which ignore reqlevel) still cast it.
export const RACE_LOCKED_REQLEVEL = '100';

/** Every skill name hireling.txt assigns to a mercenary (Skill1–Skill6). */
export function getHirelingSkillNames(headers: string[], rows: string[][]): Set<string> {
  const names = new Set<string>();
  for (let i = 1; i <= 6; i++) {
    const col = headers.indexOf(`Skill${i}`);
    if (col === -1) continue;
    for (const row of rows) {
      if (row[col]) names.add(row[col]);
    }
  }
  return names;
}

/**
 * Convert every non-race class into Prayer filler. Returns updated placements (mutated
 * in place for non-race entries) and a substitutes list the route can feed through its
 * existing in-place row-overwrite / synergy / icon logic.
 *
 * Safe because each game skill is placed on exactly one class: overwriting non-race skill
 * rows with Prayer never touches a race-class skill row, and the Prayer row itself is only
 * ever a substitute *source*, so its data is preserved. 30 rows sharing the "Prayer"
 * skilldesc is fine — D2R keys skills by row / *Id, not by skilldesc.
 *
 * `keepSkills` (the mercenary skills) are left with their vanilla mechanics on filler
 * classes and returned as `lockedSkills` for the route to make unlearnable. `fillerSkills`
 * names every row that now holds Prayer filler.
 */
export function applyRaceMode(
  seed: number,
  placements: SkillPlacement[],
  substitutes: SkillSubstitute[],
  skills: SkillEntry[],
  keepSkills: ReadonlySet<string> = new Set(),
): {
  placements: SkillPlacement[];
  substitutes: SkillSubstitute[];
  raceClass: ClassCode;
  fillerSkills: Set<string>;
  lockedSkills: Set<string>;
} {
  const raceClass = pickRaceClassCode(seed);
  const fillerSkills = new Set<string>();
  const lockedSkills = new Set<string>();
  const prayer = skills.find(s => s.skill === 'Prayer');
  if (!prayer) {
    console.error('[race-mode] Prayer skill not found — race mode filler not applied');
    return { placements, substitutes, raceClass, fillerSkills, lockedSkills };
  }
  const vanillaByName = new Map(skills.map(s => [s.skill, s]));

  // Keep the race class's normal randomized substitutes; drop the rest (those classes are
  // being fully replaced with Prayer below).
  const newSubstitutes: SkillSubstitute[] = substitutes.filter(s => s.targetClass === raceClass);

  for (const p of placements) {
    if (p.targetClass === raceClass) continue;
    const droppedSkill = p.skill;

    // Merc skill: restore its vanilla entry (it may have been a substitute, whose row
    // would otherwise carry foreign mechanics) and leave the row alone.
    const vanilla = keepSkills.has(droppedSkill.skill) ? vanillaByName.get(droppedSkill.skill) : undefined;
    if (vanilla) {
      p.skill = vanilla;
      lockedSkills.add(vanilla.skill);
      continue;
    }

    // Borrow Prayer's mechanics/display while keeping this row's identity so writers still
    // find the original row by name / *Id / skilldesc.
    p.skill = {
      ...prayer,
      skill: droppedSkill.skill,
      skilldesc: droppedSkill.skilldesc,
      id: droppedSkill.id,
      lineNumber: droppedSkill.lineNumber,
    };
    fillerSkills.add(droppedSkill.skill);
    newSubstitutes.push({ droppedSkill, sourceSkill: prayer, targetClass: p.targetClass });
  }

  return { placements, substitutes: newSubstitutes, raceClass, fillerSkills, lockedSkills };
}
