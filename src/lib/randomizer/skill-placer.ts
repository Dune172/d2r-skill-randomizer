import { ClassCode, SkillEntry, SkillPlacement, TreePage } from './types';
import { SeededRNG } from './seed';
import { CLASS_DEFS, CLASS_RESTRICTED_TYPES } from './config';

// Anim codes that only exist on one character class — skill breaks on any other class.
// KK = Assassin only (Dragon Talon, Dragon Tail)
// TH (throw) is NOT listed here: all classes have TH animation frames, so javelin
// skills keep their TH animation on any class they land on.
// S3 (Druid shapeshifted form) is NOT listed here: all S3 skills (Rabies, Hunger)
// have restrict=2, so they're already pinned via the restrict check above.
// S2 (Assassin trap/blade casting) is NOT listed here: on non-Assassin classes it
// falls back to SC, which is the standard summon animation used by all other classes.
// S1 (Amazon/Paladin dodge stance) is NOT listed here: on non-S1 classes it falls
// back to SC/A1, which is acceptable — the skill still functions correctly.
const CLASS_SPECIFIC_ANIMS = new Set(['KK']);

// Skills that cannot be placed on specific classes.
// Charge requires SQ animation + seqinput=8 for smooth client-side movement;
// Necromancer lacks SQ support, so Charge on nec always breaks movement/shake.
//
// Zeal (srvdofunc=13/cltdofunc=21) fires multiple hits on A1 frame events.
// On classes without A1 (sor, nec, war), pickBestAnim falls back to SQ, which
// means mana drains once but the multi-swing never triggers.
const SKILL_CLASS_EXCLUSIONS: Partial<Record<ClassCode, Set<string>>> = {
  nec: new Set(['Charge', 'Zeal']),
  sor: new Set(['Zeal']),
  war: new Set(['Zeal']),
};

// restrict=2 skills that are exempt from the class pin: they use shapeshift-only
// mechanics but are co-placed with the transformation skills (Wearwolf/Wearbear)
// via COPACEMENT_REQUIRES, so they'll always land on a class that can shift.
const RESTRICT2_COPACED = new Set(['Rabies', 'Hunger']);

// Skills whose mechanics are encoded in hardcoded engine-level animation
// sequence numbers + movement timing that cannot be rebound via skills.txt.
// They only play correctly on their native character class (assertion errors,
// stuck animations, or hard crashes otherwise). Each of these is pinned to
// its native class, but with a seeded 50% coin flip in placeSkills so that
// the native class doesn't always carry the skill — when the flip fails, the
// skill is dropped from the seed entirely and a duplicate of another pool
// skill takes its slot instead.
export const HARDCODED_CLASS_SKILLS: Readonly<Record<string, ClassCode>> = {
  'Leap': 'bar',
  'Leap Attack': 'bar',
  'Whirlwind': 'bar',
  'Dragon Flight': 'ass',
  'Fend': 'ama',
  'Inferno': 'sor',
  'Arctic Blast': 'dru',
  'Zeal': 'pal',
};

/**
 * Returns true if this skill must stay on its original class:
 * - HARDCODED_CLASS_SKILLS: engine-hardcoded animation/movement sequences
 * - weapsel=3: requires dual weapons (only Barbarian and Assassin can dual-wield)
 * - itypeb1=h2h/h2h2: requires claw in off-hand (only Assassin can equip claws)
 * - restrict=2: requires shapeshifted form (only Druid can shapeshift),
 *   except skills in RESTRICT2_COPACED which are kept with their transformation skill instead
 * - CLASS_RESTRICTED_TYPES on passiveitype/itypea: class-exclusive weapon types
 * - CLASS_SPECIFIC_ANIMS: animation only exists on the original class
 */
function isPinnedToOriginalClass(skill: SkillEntry): boolean {
  return (
    skill.skill in HARDCODED_CLASS_SKILLS ||
    skill.weapsel === 3 ||
    skill.itypeb1 === 'h2h' ||
    skill.itypeb1 === 'h2h2' ||
    (skill.restrict === 2 && !RESTRICT2_COPACED.has(skill.skill)) ||
    CLASS_RESTRICTED_TYPES.has(skill.passiveitype ?? '') ||
    CLASS_RESTRICTED_TYPES.has(skill.itypea1 ?? '') ||
    CLASS_RESTRICTED_TYPES.has(skill.itypea2 ?? '') ||
    CLASS_RESTRICTED_TYPES.has(skill.itypea3 ?? '') ||
    CLASS_SPECIFIC_ANIMS.has(skill.anim ?? '')
  );
}

/**
 * Shuffle all 240 class skills and assign them to FILLED grid slots
 * across all 8 classes' assigned tree pages.
 * Skills that require class-specific abilities (dual-wield, shapeshifting,
 * off-hand claws) are pinned to their original class. All others are shuffled.
 * Skills are sorted by reqlevel within each class so that lower-level
 * skills land in earlier rows (row 1 = level 1, row 2 = level 6, etc.)
 */
export interface SkillSubstitute {
  droppedSkill: SkillEntry; // the skill that was dropped (identity kept)
  sourceSkill: SkillEntry;  // the skill whose mechanics/display we're borrowing
  targetClass: ClassCode;   // native class of the dropped skill
}

export function placeSkills(
  rng: SeededRNG,
  skills: SkillEntry[],
  treeAssignments: Map<ClassCode, TreePage[]>,
  opts?: { excludeSkills?: Set<string> },
): { placements: SkillPlacement[]; droppedSkillNames: Set<string>; substitutes: SkillSubstitute[] } {
  // Drop categorization: a skill is dropped if (a) the user explicitly excluded it
  // via excludeSkills (e.g. "Remove Teleport") or (b) it's a HARDCODED_CLASS_SKILLS
  // entry that lost its seeded 50% coin flip. Dropped skills do not appear in the
  // player tree; their tree slot (on their native class) gets filled by a substitute
  // below. The substitute uses the dropped skill's row identity (skill name, *Id,
  // skilldesc) but borrows mechanics + display name from another placed skill.
  const excludeSkills = opts?.excludeSkills;
  const droppedSkillNames = new Set<string>();
  const droppedSkillsByClass = new Map<ClassCode, SkillEntry[]>();
  const keptSkills: SkillEntry[] = [];
  for (const skill of skills) {
    if (excludeSkills?.has(skill.skill)) {
      const cls = (HARDCODED_CLASS_SKILLS[skill.skill] ?? skill.charclass) as ClassCode;
      if (!droppedSkillsByClass.has(cls)) droppedSkillsByClass.set(cls, []);
      droppedSkillsByClass.get(cls)!.push(skill);
      droppedSkillNames.add(skill.skill);
      continue;
    }
    const hardcodedClass = HARDCODED_CLASS_SKILLS[skill.skill];
    if (hardcodedClass !== undefined && rng.next() >= 0.5) {
      if (!droppedSkillsByClass.has(hardcodedClass)) droppedSkillsByClass.set(hardcodedClass, []);
      droppedSkillsByClass.get(hardcodedClass)!.push(skill);
      droppedSkillNames.add(skill.skill);
      continue;
    }
    keptSkills.push(skill);
  }

  // Separate pinned skills (must stay on original class) from the shuffle pool
  const pinnedByClass = new Map<ClassCode, SkillEntry[]>();
  const shufflePool: SkillEntry[] = [];
  for (const skill of keptSkills) {
    if (isPinnedToOriginalClass(skill)) {
      const cls = skill.charclass as ClassCode;
      if (!pinnedByClass.has(cls)) pinnedByClass.set(cls, []);
      pinnedByClass.get(cls)!.push(skill);
    } else {
      shufflePool.push(skill);
    }
  }

  // Shuffle the remaining skills
  const shuffled = rng.shuffle(shufflePool);
  const placements: SkillPlacement[] = [];

  // First pass: count how many slots each class needs
  const classSlotsCount: number[] = [];
  for (const classDef of CLASS_DEFS) {
    const trees = treeAssignments.get(classDef.code)!;
    let count = 0;
    for (const tree of trees) {
      count += tree.slots.filter(s => s.status === 'FILLED').length;
    }
    classSlotsCount.push(count);
  }

  // Track vacated slots per class — slots left over after normal distribution
  // (one per dropped skill on that class). Substitutes fill these below.
  const vacatedByClass = new Map<ClassCode, Array<{ tabIndex: number; tree: TreePage; row: number; col: number; iconCel: number; skillIndex: number }>>();

  // Distribute shuffled skills to each class, then sort by reqlevel within each class.
  // Each class reserves `dropCount` slots for substitutes (via reduced shuffledCount),
  // so the dropped skills' native-class slots end up vacated rather than a random
  // tail class being shortchanged.
  let skillIdx = 0;
  for (let ci = 0; ci < CLASS_DEFS.length; ci++) {
    const classDef = CLASS_DEFS[ci];
    const classCode = classDef.code;
    const trees = treeAssignments.get(classCode)!;
    const slotCount = classSlotsCount[ci];

    // Pinned skills for this class stay here; fill remaining slots from the shuffle pool
    const pinned = pinnedByClass.get(classCode) || [];
    const dropCount = (droppedSkillsByClass.get(classCode) || []).length;
    if (pinned.length + dropCount > slotCount) {
      console.error(`Class ${classCode}: ${pinned.length} pinned + ${dropCount} drops exceeds ${slotCount} slots`);
    }
    const shuffledCount = Math.max(0, slotCount - pinned.length - dropCount);
    const classShuffled = shuffled.slice(skillIdx, skillIdx + shuffledCount);
    skillIdx += shuffledCount;

    // Combine pinned + shuffled, then sort by reqlevel
    const classSkills = [...pinned, ...classShuffled];

    // Sort by reqlevel so lowest-level skills go in earliest rows
    classSkills.sort((a, b) => a.reqlevel - b.reqlevel);

    // Collect all FILLED slots across all 3 tabs, sorted by tab then row then col
    const allSlots: { tabIndex: number; tree: TreePage; row: number; col: number }[] = [];
    for (let tabIndex = 0; tabIndex < trees.length; tabIndex++) {
      const tree = trees[tabIndex];
      const filledSlots = tree.slots
        .filter(s => s.status === 'FILLED')
        .sort((a, b) => a.row - b.row || a.col - b.col);
      for (const slot of filledSlots) {
        allSlots.push({ tabIndex, tree, row: slot.row, col: slot.col });
      }
    }

    // Sort all slots by row first (across all tabs), then by tab, then by col
    allSlots.sort((a, b) => a.row - b.row || a.tabIndex - b.tabIndex || a.col - b.col);

    // Assign sorted skills to sorted slots
    for (let i = 0; i < classSkills.length && i < allSlots.length; i++) {
      const skill = classSkills[i];
      const slot = allSlots[i];
      const classSkillIndex = i;
      const iconCel = classSkillIndex * 2;

      placements.push({
        skill,
        targetClass: classCode,
        treePage: slot.tree,
        tabIndex: slot.tabIndex,
        row: slot.row,
        col: slot.col,
        iconCel,
        skillIndex: classSkillIndex,
      });
    }

    // Record vacated slots (one per drop) for substitute assignment
    const vacated: Array<{ tabIndex: number; tree: TreePage; row: number; col: number; iconCel: number; skillIndex: number }> = [];
    for (let i = classSkills.length; i < allSlots.length; i++) {
      vacated.push({ ...allSlots[i], iconCel: i * 2, skillIndex: i });
    }
    vacatedByClass.set(classCode, vacated);

    if (classSkills.length + dropCount < 30) {
      console.warn(`Class ${classCode} only got ${classSkills.length + dropCount} skills (expected ~30)`);
    }
  }

  if (skillIdx < shuffled.length) {
    console.warn(`${shuffled.length - skillIdx} skills were not placed`);
  }

  // Now inject substitutes. For each dropped skill, pick a source placement on a
  // different class whose display-name isn't already on the dropped skill's native
  // class (no same-class duplicate), then build a substitute SkillEntry that spreads
  // source's mechanics/synergy fields but keeps dropped's identity (skill/skilldesc/id).
  const substitutes: SkillSubstitute[] = [];
  for (const [targetClass, drops] of droppedSkillsByClass) {
    const vacated = vacatedByClass.get(targetClass) || [];
    // Track descs already on target class (from normal placements + any earlier subs on this class)
    const descsOnClass = new Set(
      placements.filter(p => p.targetClass === targetClass).map(p => p.skill.skilldesc)
    );
    for (let i = 0; i < drops.length && i < vacated.length; i++) {
      const droppedSkill = drops[i];
      const slot = vacated[i];
      // Candidates: placements on a different class whose skilldesc isn't already on targetClass
      const candidates = placements.filter(p =>
        p.targetClass !== targetClass && !descsOnClass.has(p.skill.skilldesc)
      );
      if (candidates.length === 0) {
        console.warn(`No substitute source available for dropped ${droppedSkill.skill} on ${targetClass}`);
        continue;
      }
      const source = candidates[rng.randInt(0, candidates.length - 1)];

      // Build substitute: source's mechanics/synergies/etype/charclass (for icon folder)
      // and source.skill as displayName, but dropped's row identity so writers find
      // the original row by name / *Id / skilldesc.
      const subSkill: SkillEntry = {
        ...source.skill,
        skill: droppedSkill.skill,
        skilldesc: droppedSkill.skilldesc,
        id: droppedSkill.id,
        lineNumber: droppedSkill.lineNumber,
        displayName: source.skill.displayName ?? source.skill.skill,
      };

      placements.push({
        skill: subSkill,
        targetClass,
        treePage: slot.tree,
        tabIndex: slot.tabIndex,
        row: slot.row,
        col: slot.col,
        iconCel: slot.iconCel,
        skillIndex: slot.skillIndex,
      });
      descsOnClass.add(subSkill.skilldesc);
      substitutes.push({ droppedSkill, sourceSkill: source.skill, targetClass });
    }
  }

  resolveExclusions(placements);
  resolveCoplacements(placements);

  return { placements, droppedSkillNames, substitutes };
}

/**
 * Swap any skills that landed on excluded classes with a compatible partner.
 * For each violation (skill X on class C where C excludes X), find another
 * placement where X is allowed on the partner's class and the partner's skill
 * is allowed on C. Swaps just the skill entries, leaving slot geometry intact.
 */
function resolveExclusions(placements: SkillPlacement[]): void {
  for (let i = 0; i < placements.length; i++) {
    const p = placements[i];
    const excluded = SKILL_CLASS_EXCLUSIONS[p.targetClass];
    if (!excluded?.has(p.skill.skill)) continue;

    // Find a swap partner on a different class
    let swapped = false;
    for (let j = 0; j < placements.length; j++) {
      if (j === i) continue;
      const partner = placements[j];
      if (partner.targetClass === p.targetClass) continue;

      // p.skill must be allowed on partner.targetClass
      const partnerClassExcluded = SKILL_CLASS_EXCLUSIONS[partner.targetClass];
      if (partnerClassExcluded?.has(p.skill.skill)) continue;

      // partner.skill must be allowed on p.targetClass
      if (excluded.has(partner.skill.skill)) continue;

      // Can't pull a pinned skill off its native class (hardcoded animations,
      // dual-wield, claws, shapeshift, etc. — see isPinnedToOriginalClass).
      if (isPinnedToOriginalClass(partner.skill)) continue;

      [placements[i].skill, placements[j].skill] = [placements[j].skill, placements[i].skill];
      swapped = true;
      break;
    }

    if (!swapped) {
      console.warn(`Could not find a valid swap partner for ${p.skill.skill} on ${p.targetClass} — exclusion not enforced`);
    }
  }
}

// Co-placement constraints: a skill must share its class with at least one peer.
// Skeleton Mastery is only useful if the player can also raise skeletons.
// Rabies/Hunger (restrict=2, shapeshift-only) must land on the same class as a
// transformation skill so they're actually usable.
const COPACEMENT_REQUIRES: Record<string, string[]> = {
  'Skeleton Mastery': ['Raise Skeleton', 'Raise Skeletal Mage'],
  'Rabies': ['Wearwolf', 'Wearbear'],
  'Hunger': ['Wearwolf', 'Wearbear'],
};

/**
 * Ensure co-placement constraints are satisfied after initial placement.
 * For each constrained skill, if none of its required peers landed on the same
 * class, move it to a class that does have a peer by swapping it with a skill
 * from that class (excluding the peer itself).
 */
function resolveCoplacements(placements: SkillPlacement[]): void {
  // Build skill name → placement index for quick lookup
  const bySkill = new Map<string, number>();
  for (let i = 0; i < placements.length; i++) {
    bySkill.set(placements[i].skill.skill, i);
  }

  for (const [skillName, peers] of Object.entries(COPACEMENT_REQUIRES)) {
    const skillIdx = bySkill.get(skillName);
    if (skillIdx === undefined) continue;

    const currentClass = placements[skillIdx].targetClass;

    // Already satisfied if any peer is on the same class
    if (peers.some(peer => {
      const idx = bySkill.get(peer);
      return idx !== undefined && placements[idx].targetClass === currentClass;
    })) continue;

    // Find the first peer that exists and pick its class as the destination
    let destClass: ClassCode | undefined;
    for (const peer of peers) {
      const idx = bySkill.get(peer);
      if (idx !== undefined) { destClass = placements[idx].targetClass; break; }
    }
    if (!destClass) continue; // no peer exists at all — nothing to do

    // Swap skillName with any skill on destClass that isn't a required peer
    const peerSet = new Set(peers);
    let swapped = false;
    for (let j = 0; j < placements.length; j++) {
      if (j === skillIdx) continue;
      const partner = placements[j];
      if (partner.targetClass !== destClass) continue;
      if (peerSet.has(partner.skill.skill)) continue; // don't displace the peer itself
      // Can't pull a pinned skill off its native class.
      if (isPinnedToOriginalClass(partner.skill)) continue;

      // Respect static exclusions in both directions
      if (SKILL_CLASS_EXCLUSIONS[destClass]?.has(skillName)) continue;
      if (SKILL_CLASS_EXCLUSIONS[currentClass]?.has(partner.skill.skill)) continue;

      [placements[skillIdx].skill, placements[j].skill] = [placements[j].skill, placements[skillIdx].skill];
      bySkill.set(placements[skillIdx].skill.skill, skillIdx);
      bySkill.set(placements[j].skill.skill, j);
      swapped = true;
      break;
    }

    if (!swapped) {
      console.warn(`Could not satisfy co-placement constraint: ${skillName} requires one of [${peers.join(', ')}]`);
    }
  }
}

/**
 * Group placements by target class
 */
export function groupByClass(
  placements: SkillPlacement[],
): Map<ClassCode, SkillPlacement[]> {
  const map = new Map<ClassCode, SkillPlacement[]>();
  for (const p of placements) {
    if (!map.has(p.targetClass)) {
      map.set(p.targetClass, []);
    }
    map.get(p.targetClass)!.push(p);
  }
  return map;
}
