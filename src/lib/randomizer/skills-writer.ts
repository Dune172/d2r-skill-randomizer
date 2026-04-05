import { ClassCode, SkillEntry, SkillPlacement } from './types';
import { CLASS_BY_CODE } from './config';
import { PrereqAssignment } from './prereq-assigner';

// Animation codes each class's character model supports.
// Using an animation code not in this set causes game freezes.
// TH (throw) is supported by all classes — every character has throw animation frames.
const CLASS_SUPPORTED_ANIMS: Record<string, Set<string>> = {
  ama: new Set(['A1', 'S1', 'SC', 'SQ', 'TH']),
  sor: new Set(['SC', 'SQ', 'TH']),
  nec: new Set(['A1', 'SC', 'TH']),
  pal: new Set(['A1', 'S1', 'SC', 'SQ', 'TH']),
  bar: new Set(['A1', 'SC', 'SQ', 'TH']),
  dru: new Set(['A1', 'S3', 'SC', 'SQ', 'TH']),
  ass: new Set(['A1', 'KK', 'S2', 'SC', 'SQ', 'TH']),
  war: new Set(['SC', 'SQ', 'TH']),
};

// Weapon types that indicate a hand-to-hand / melee skill.
const MELEE_TYPES = new Set([
  'mele', 'swor', 'axe', 'mace', 'hamm', 'spea', 'pole',
  'club', 'scep', 'knif', 'tkni',
]);

type SkillCategory = 'melee' | 'aura' | 'default';

function getSkillCategory(skill: SkillEntry): SkillCategory {
  if ([skill.itypea1, skill.itypea2, skill.itypea3].some(t => t && MELEE_TYPES.has(t))) {
    return 'melee';
  }
  if (skill.aurastate) return 'aura';
  return 'default';
}

// Ordered animation preference per category — first supported entry wins.
const ANIM_PREFERENCES: Record<SkillCategory, string[]> = {
  melee:   ['A1', 'SQ', 'SC'],
  aura:    ['SC'],
  default: [], // 'default' preserves original if supported; falls back to SC
};

// Skills whose client animation functions depend on SQ sequence completion.
// Their cltdofunc waits for a SQ sequence event to release the action lock —
// changing anim to A1 means that event never fires and the character stays frozen.
// Charge also requires SQ: cltdofunc=37 is a client-side movement function that uses
// seqinput=8 to fire the rush at frame 8 of the SQ sequence. Without SQ+seqinput,
// the movement has no timing anchor → position snapping (screen shake) and late movement.
const SQ_DEPENDENT_SKILLS = new Set(['Leap', 'LeapAttack', 'Charge']);

// Channeled-spray skills: seqtrans=SQ creates an infinite channel loop, and seqnum/seqinput
// drive the hold-to-channel mechanism. If seqnum/seqinput are cleared on a non-native class
// the spray fires once then stops. These skills must preserve seqnum/seqinput whenever the
// SQ animation is preserved (i.e. anim didn't change), even across classes.
// They also need SQ preserved on all SQ-capable classes (same logic as SQ_DEPENDENT_SKILLS).
const CHANNELED_SQ_SKILLS = new Set(['Inferno', 'Arctic Blast']);

function pickBestAnim(
  skill: SkillEntry,
  originalAnim: string,
  supported: Set<string>,
): string {
  // Preserve SQ for skills whose mechanics require it (action-lock or channeling loop).
  if (originalAnim === 'SQ' && supported.has('SQ') &&
      (SQ_DEPENDENT_SKILLS.has(skill.skill) || CHANNELED_SQ_SKILLS.has(skill.skill))) {
    return 'SQ';
  }

  const category = getSkillCategory(skill);
  if (category === 'default') {
    return supported.has(originalAnim) ? originalAnim : 'SC';
  }
  for (const anim of ANIM_PREFERENCES[category]) {
    if (supported.has(anim)) return anim;
  }
  return 'SC';
}

// Column indices in skills.txt (0-based)
const COL = {
  skill: 0,
  id: 1,
  charclass: 2,
  skilldesc: 3,
  reqskill1: 184,
  reqskill2: 185,
  reqskill3: 186,
  restrict: 187,
  DmgSymPerCalc: 297,
  EDmgSymPerCalc: 311,
  ELenSymPerCalc: 316,
  passiveitype: 49,
  itypea1: 136,
  itypea2: 137,
  itypea3: 138,
  itypeb1: 141,
  anim: 146,
  seqtrans: 147,
  seqnum: 149,
  seqinput: 150,
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
  const reqlevelIdx = safeGetCol(headers, 'reqlevel', 178);
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
  const restrictIdx   = safeGetCol(headers, 'restrict',  COL.restrict);
  const leftskillIdx = safeGetCol(headers, 'leftskill', -1);
  const animIdx = safeGetCol(headers, 'anim', COL.anim);
  const seqtransIdx = safeGetCol(headers, 'seqtrans', COL.seqtrans);
  const seqnumIdx   = safeGetCol(headers, 'seqnum',   COL.seqnum);
  const seqinputIdx = safeGetCol(headers, 'seqinput', COL.seqinput);

  for (const row of rows) {
    const skillName = row[0]; // skill column is always first
    const placement = skillToPlacement.get(skillName);
    if (!placement) continue;

    const classDef = CLASS_BY_CODE.get(placement.targetClass);
    if (!classDef) continue;

    // Update charclass
    row[charclassIdx] = classDef.charclass;

    // Pick the best animation for this skill+class combo, then sync seqtrans.
    // Melee skills prefer A1 (weapon swing) over SQ/SC; others preserve original
    // if supported, else fall back to SC.
    // Skip animation updates entirely for skills on their native class — the
    // original animation is already correct and shouldn't be touched.
    const isNativeClass = classDef.charclass === placement.skill.charclass;
    const supportedAnims = CLASS_SUPPORTED_ANIMS[placement.targetClass];
    if (!isNativeClass && supportedAnims && animIdx >= 0) {
      const originalAnim = row[animIdx];
      if (originalAnim) {
        const bestAnim = pickBestAnim(placement.skill, originalAnim, supportedAnims);
        const isSameAnim = bestAnim === originalAnim;

        row[animIdx] = bestAnim;

        if (seqtransIdx >= 0) {
          if (!isSameAnim) {
            // Anim changed: sync seqtrans to the new anim type.
            row[seqtransIdx] = bestAnim;
          } else {
            // Anim unchanged (e.g. SQ stays SQ): do NOT blindly overwrite seqtrans.
            // seqtrans is the exit state after the sequence — for Leap it's A1 (landing
            // attack), which is what releases the action lock. Setting seqtrans=SQ here
            // would create an infinite loop and permanently freeze the character.
            // Instead, only fix it if the original seqtrans is unsupported on the target class.
            const origSeqtrans = row[seqtransIdx];
            if (origSeqtrans && !supportedAnims.has(origSeqtrans)) {
              // Unsupported seqtrans would freeze the game; pick the safest supported exit.
              row[seqtransIdx] = supportedAnims.has('A1') ? 'A1' : 'SC';
            }
            // else: preserve original seqtrans (e.g. A1 on Barbarian → lock releases correctly)
          }
        }

        // Clear seqnum/seqinput when anim changes, EXCEPT for channeled-SQ skills:
        // their seqnum/seqinput drive the hold-to-channel loop and must be preserved
        // whenever the SQ animation is kept (isSameAnim=true).
        const preserveSeq = isSameAnim && CHANNELED_SQ_SKILLS.has(placement.skill.skill);
        if (!preserveSeq && !isSameAnim) {
          if (seqnumIdx >= 0)   row[seqnumIdx]   = '';
          if (seqinputIdx >= 0) row[seqinputIdx] = '';
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

    // Ensure cross-class skills are assignable to the left mouse button.
    // Some skills have leftskill=0 by vanilla design (e.g. Raven, Valkyrie) but
    // randomized skills should be usable on either mouse button.
    if (leftskillIdx >= 0 && row[leftskillIdx] === '0') {
      row[leftskillIdx] = '1';
    }

    // Melee attacks, auras, and weapon masteries on the Druid's tree should be
    // usable in shapeshifted form (restrict=1 = usable in any state).
    // Spells, ranged, summons, and curses keep restrict=null (blocked while shifted).
    // Form-exclusive skills (restrict=2, bear/wolf only) are never changed.
    // Skills with SQ animation are excluded: bear/wolf models lack an SQ sequence,
    // so using an SQ-animated skill while shifted would freeze the character.
    // Whirlwind and Charge are also excluded: their movement mechanics don't work
    // correctly in shapeshifted form regardless of animation.
    const SHIFTED_FORM_BLOCKED = new Set(['Whirlwind', 'Charge']);
    if (restrictIdx >= 0 && placement.targetClass === 'dru') {
      const cat = getSkillCategory(placement.skill);
      const isPassive = !!placement.skill.passiveitype;
      const finalAnim = animIdx >= 0 ? row[animIdx] : '';
      const animSafeInForm = !finalAnim || finalAnim === 'A1' || finalAnim === 'SC';
      if (row[restrictIdx] !== '2' && animSafeInForm && !SHIFTED_FORM_BLOCKED.has(placement.skill.skill) && (cat === 'melee' || cat === 'aura' || isPassive)) {
        row[restrictIdx] = '1';
      }
    }

  }
}

function safeGetCol(headers: string[], name: string, fallback: number): number {
  const idx = headers.indexOf(name);
  return idx !== -1 ? idx : fallback;
}
