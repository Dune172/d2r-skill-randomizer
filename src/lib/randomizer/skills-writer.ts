import { ClassCode, SkillEntry, SkillPlacement } from './types';
import { CLASS_BY_CODE, CLASS_DEFS } from './config';

const CLASS_ORDER = CLASS_DEFS.map(d => d.code);
import { PrereqAssignment } from './prereq-assigner';
import { HARDCODED_CLASS_SKILLS } from './skill-placer';

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
const SQ_DEPENDENT_SKILLS = new Set(['Leap', 'Leap Attack', 'Charge']);

// Channeled-spray skills: seqtrans=SQ creates an infinite channel loop, and seqnum/seqinput
// drive the hold-to-channel mechanism. If seqnum/seqinput are cleared on a non-native class
// the spray fires once then stops. These skills must preserve seqnum/seqinput whenever the
// SQ animation is preserved (i.e. anim didn't change), even across classes.
// They also need SQ preserved on all SQ-capable classes (same logic as SQ_DEPENDENT_SKILLS).
const CHANNELED_SQ_SKILLS = new Set(['Inferno', 'Arctic Blast', 'Bind Demon']);

// Skills whose seqnum encodes a Barbarian-specific SQ sub-sequence index.
// Preserving seqnum on non-Barbarian classes fires the landing "crash" event at the
// wrong frame (too early), then the rest of the SQ plays as a slide.
// Clear seqnum/seqinput whenever these skills land on a non-native class.
const BARB_SEQNUM_SKILLS = new Set(['Leap', 'Leap Attack']);

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
 *
 * Synergy formulas are remapped separately by updateSkillsSynergies (which
 * mutates rows in place across all calc columns). Call it before this.
 */
export function writeSkillsRows(
  headers: string[],
  rows: string[][],
  placements: SkillPlacement[],
  prereqAssignments: Map<string, PrereqAssignment>,
): void {
  // Build lookup: skill name → placement
  const skillToPlacement = new Map<string, SkillPlacement>();
  for (const p of placements) {
    skillToPlacement.set(p.skill.skill, p);
  }

  // Identify which class(es) host a shapeshift form skill. The restrict=1
  // promotion below (making melee skills usable in form) and weapon-gate
  // clearing should apply on any class that received Wearwolf or Wearbear,
  // not just Druid — since the form skills are now shuffled across classes
  // (see COPACEMENT_REQUIRES in skill-placer.ts).
  const formHostClasses = new Set<string>();
  for (const p of placements) {
    if (p.skill.skill === 'Wearwolf' || p.skill.skill === 'Wearbear') {
      formHostClasses.add(p.targetClass);
    }
  }

  // Row number → required level mapping
  const ROW_TO_LEVEL: Record<number, number> = { 1: 1, 2: 6, 3: 12, 4: 18, 5: 24, 6: 30 };

  // Resolve column indices dynamically (fallback to hardcoded)
  const charclassIdx = safeGetCol(headers, 'charclass', COL.charclass);
  const reqlevelIdx = safeGetCol(headers, 'reqlevel', 178);
  const reqskill1Idx = safeGetCol(headers, 'reqskill1', COL.reqskill1);
  const reqskill2Idx = safeGetCol(headers, 'reqskill2', COL.reqskill2);
  const reqskill3Idx = safeGetCol(headers, 'reqskill3', COL.reqskill3);
  const passiveitypeIdx = safeGetCol(headers, 'passiveitype', COL.passiveitype);
  const itypea1Idx = safeGetCol(headers, 'itypea1', COL.itypea1);
  const itypea2Idx = safeGetCol(headers, 'itypea2', COL.itypea2);
  const itypea3Idx = safeGetCol(headers, 'itypea3', COL.itypea3);
  const itypeb1Idx = safeGetCol(headers, 'itypeb1', COL.itypeb1);
  const restrictIdx   = safeGetCol(headers, 'restrict',  COL.restrict);
  const etypea1Idx = safeGetCol(headers, 'etypea1', -1);
  const etypea2Idx = safeGetCol(headers, 'etypea2', -1);
  const weapselIdx = safeGetCol(headers, 'weapsel', -1);
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
    // Shapeshift form attacks (restrict=2) run on the wolf/bear form model, which owns its own animation set independent of the host class's base model.
    const isFormOnly = restrictIdx >= 0 && row[restrictIdx] === '2';
    const supportedAnims = CLASS_SUPPORTED_ANIMS[placement.targetClass];
    if (!isNativeClass && !isFormOnly && supportedAnims && animIdx >= 0) {
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
            // Exception: channeled-SQ skills intentionally use seqtrans=SQ (channel loop).
            const origSeqtrans = row[seqtransIdx];
            const isChanneled = CHANNELED_SQ_SKILLS.has(placement.skill.skill);
            if (origSeqtrans === 'SQ' && !isChanneled) {
              // Non-channeled SQ→SQ seqtrans creates an infinite loop on any class that
              // supports SQ (e.g. Cleave/Mirrored Blades on Paladin). Break it by exiting
              // to A1 (recovery swing) if available, otherwise SC.
              row[seqtransIdx] = supportedAnims.has('A1') ? 'A1' : 'SC';
            } else if (origSeqtrans && !supportedAnims.has(origSeqtrans)) {
              // Unsupported seqtrans would freeze the game; pick the safest supported exit.
              row[seqtransIdx] = supportedAnims.has('A1') ? 'A1' : 'SC';
            }
            // else: preserve original seqtrans (e.g. A1 on Barbarian → lock releases correctly)
          }
        }

        // Clear seqnum/seqinput when anim changes, EXCEPT for channeled-SQ skills:
        // their seqnum/seqinput drive the hold-to-channel loop and must be preserved
        // whenever the SQ animation is kept (isSameAnim=true).
        // Also always clear for BARB_SEQNUM_SKILLS: their seqnum is a Barbarian-specific
        // SQ sub-sequence index that fires the landing event at the wrong frame on other classes.
        const preserveSeq = isSameAnim && CHANNELED_SQ_SKILLS.has(placement.skill.skill);
        const clearBarbSeq = BARB_SEQNUM_SKILLS.has(placement.skill.skill);
        if ((!preserveSeq && !isSameAnim) || clearBarbSeq) {
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

    // leftskill / rightskill are preserved from vanilla. These columns are read
    // by both the K&M and controller UIs to decide which mouse-button slots a
    // skill can bind to, and they interact with other flags (e.g. aura, state
    // toggles) in ways we don't fully enumerate. Previously we force-set
    // leftskill=1 on every cross-class skill with vanilla leftskill=0 for QoL,
    // but that caused auras on non-Paladin classes to bind incorrectly to
    // left-click on controller, breaking the hotkey toggle. Rather than patch
    // per-category exceptions, trust the vanilla columns.

    // Melee attacks, auras, and weapon masteries on the form-host class's tree
    // should be usable in shapeshifted form (restrict=1 = usable in any state).
    // Spells, ranged, summons, and curses keep restrict=null (blocked while shifted).
    // Form-exclusive skills (restrict=2, bear/wolf only) are never changed.
    // Skills with SQ animation are excluded: bear/wolf models lack an SQ sequence,
    // so using an SQ-animated skill while shifted would freeze the character.
    // Whirlwind and Charge are also excluded: their movement mechanics don't work
    // correctly in shapeshifted form regardless of animation.
    //
    // Tiger Strike, Cobra Strike, and Royal Strike (Phoenix Strike) are
    // charge-up Martial Arts: they accumulate charges that release on the
    // next normal attack. The wolf/bear form's normal-attack uses a different
    // srvdofunc that doesn't trigger charge release, so the charges would
    // accumulate forever with no way to discharge them while shifted.
    //
    // Weapon-type gates (itypea1/2/3, etypea1/2, weapsel) are also cleared so
    // the skill fires regardless of which weapon happens to be equipped while
    // shifted — bear/wolf forms hide the visual weapon and many cross-class
    // melee skills would otherwise silently fail their item-type check.
    const SHIFTED_FORM_BLOCKED = new Set([
      'Whirlwind', 'Charge',
      'Tiger Strike', 'Cobra Strike', 'Royal Strike',
    ]);
    if (restrictIdx >= 0 && formHostClasses.has(placement.targetClass)) {
      const cat = getSkillCategory(placement.skill);
      const isPassive = !!placement.skill.passiveitype;
      const finalAnim = animIdx >= 0 ? row[animIdx] : '';
      const animSafeInForm = !finalAnim || finalAnim === 'A1' || finalAnim === 'SC';
      if (row[restrictIdx] !== '2' && animSafeInForm && !SHIFTED_FORM_BLOCKED.has(placement.skill.skill) && (cat === 'melee' || cat === 'aura' || isPassive)) {
        row[restrictIdx] = '1';
        if (itypea1Idx >= 0) row[itypea1Idx] = '';
        if (itypea2Idx >= 0) row[itypea2Idx] = '';
        if (itypea3Idx >= 0) row[itypea3Idx] = '';
        if (etypea1Idx >= 0) row[etypea1Idx] = '';
        if (etypea2Idx >= 0) row[etypea2Idx] = '';
        if (weapselIdx >= 0) row[weapselIdx] = '';
      }
    }

  }
}

function safeGetCol(headers: string[], name: string, fallback: number): number {
  const idx = headers.indexOf(name);
  return idx !== -1 ? idx : fallback;
}

/**
 * Reorder skills.txt rows so each class occupies a contiguous 30-row block in canonical
 * class order (ama→sor→nec→pal→bar→dru→ass→war), followed by any non-class rows.
 *
 * This fixes the StaffMod bug: the D2R engine locates the first row with charclass=X
 * and reads the next 30 rows as that class's skill pool without checking individual
 * charclass values. Contiguous blocks guarantee the pool is the correct 30 skills.
 *
 * Must be called AFTER writeSkillsRows() has updated the charclass column.
 *
 * Returns reorderedRows (new row array) and idMapping (old row index → new row index)
 * for updating all numeric skill-ID references in other files (monstats, uniqueitems, etc.).
 */
export function reorderSkillsRows(
  rows: string[][],
  placements: SkillPlacement[],
): { reorderedRows: string[][]; idMapping: Map<number, number> } {
  // Build: skill name → target class
  const nameToTarget = new Map<string, ClassCode>();
  for (const p of placements) nameToTarget.set(p.skill.skill, p.targetClass);

  // Bucket rows by target class; unrecognized names go to nonClassRows.
  // Rows for HARDCODED_CLASS_SKILLS placed on their native class are pinned at
  // their original row index: D2R's engine resolves some hardcoded-animation
  // skills (Zeal's multi-hit cltdofunc=21, Leap's landing, etc.) by row position,
  // so drift breaks the animation even though skills.txt anim columns are correct.
  const classBuckets = new Map<ClassCode, { index: number; row: string[] }[]>(
    CLASS_ORDER.map(c => [c, []] as [ClassCode, { index: number; row: string[] }[]])
  );
  const nonClassIndices = new Set<number>();
  const hardcodedPinnedIndices = new Set<number>();

  for (let i = 0; i < rows.length; i++) {
    const skillName = rows[i][0];
    const target = nameToTarget.get(skillName);
    if (target) {
      const pinnedClass = HARDCODED_CLASS_SKILLS[skillName];
      if (pinnedClass && target === pinnedClass) {
        hardcodedPinnedIndices.add(i);
      } else {
        classBuckets.get(target)!.push({ index: i, row: rows[i] });
      }
    } else {
      nonClassIndices.add(i);
    }
  }

  // Keep non-class skills at their original positions so *Id matches row position.
  // D2R uses *Id for animation sequence lookups (monseq); moving non-class skills
  // (e.g. ShamanFire) to different positions breaks monster cast animations.
  const reorderedRows: string[][] = new Array(rows.length);
  const idMapping = new Map<number, number>();

  // 1. Pin non-class rows at their original indices
  for (const idx of nonClassIndices) {
    reorderedRows[idx] = rows[idx];
    idMapping.set(idx, idx);
  }

  // 2. Pin hardcoded-animation class skills at their original indices
  for (const idx of hardcodedPinnedIndices) {
    reorderedRows[idx] = rows[idx];
    idMapping.set(idx, idx);
  }

  // 3. Collect available (unpinned) class-skill positions in order
  const availablePositions: number[] = [];
  for (let i = 0; i < rows.length; i++) {
    if (!nonClassIndices.has(i) && !hardcodedPinnedIndices.has(i)) {
      availablePositions.push(i);
    }
  }

  // 4. Fill available positions with remaining class skills in canonical class
  //    order. Each class's 30 rows (pinned + filled) stay within the vanilla
  //    block range, so StaffMod's contiguous-block lookup still works.
  let posIdx = 0;
  for (const code of CLASS_ORDER) {
    const bucket = classBuckets.get(code)!.sort((a, b) => a.index - b.index);
    for (const { index, row } of bucket) {
      const newPos = availablePositions[posIdx++];
      reorderedRows[newPos] = row;
      idMapping.set(index, newPos);
    }
  }

  return { reorderedRows, idMapping };
}
