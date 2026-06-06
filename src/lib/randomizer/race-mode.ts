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

// Seed → ClassCode. Shares pickRaceClassIndex with the client (src/lib/classes.ts) so the
// announced class name and the generated class can't drift. CLASS_DEFS order mirrors
// CLASS_NAMES order.
export function pickRaceClassCode(seed: number): ClassCode {
  return CLASS_DEFS[pickRaceClassIndex(seed)].code;
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
 */
export function applyRaceMode(
  seed: number,
  placements: SkillPlacement[],
  substitutes: SkillSubstitute[],
  skills: SkillEntry[],
): { placements: SkillPlacement[]; substitutes: SkillSubstitute[]; raceClass: ClassCode } {
  const raceClass = pickRaceClassCode(seed);
  const prayer = skills.find(s => s.skill === 'Prayer');
  if (!prayer) {
    console.error('[race-mode] Prayer skill not found — race mode filler not applied');
    return { placements, substitutes, raceClass };
  }

  // Keep the race class's normal randomized substitutes; drop the rest (those classes are
  // being fully replaced with Prayer below).
  const newSubstitutes: SkillSubstitute[] = substitutes.filter(s => s.targetClass === raceClass);

  for (const p of placements) {
    if (p.targetClass === raceClass) continue;
    const droppedSkill = p.skill;
    // Borrow Prayer's mechanics/display while keeping this row's identity so writers still
    // find the original row by name / *Id / skilldesc.
    p.skill = {
      ...prayer,
      skill: droppedSkill.skill,
      skilldesc: droppedSkill.skilldesc,
      id: droppedSkill.id,
      lineNumber: droppedSkill.lineNumber,
    };
    newSubstitutes.push({ droppedSkill, sourceSkill: prayer, targetClass: p.targetClass });
  }

  return { placements, substitutes: newSubstitutes, raceClass };
}
