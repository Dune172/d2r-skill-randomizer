import { ClassCode, SkillEntry, SkillPlacement, TreePage } from './types';
import { SeededRNG } from './seed';
import { CLASS_DEFS, CLASS_RESTRICTED_TYPES } from './config';

// Anim codes that only exist on one character class — skill breaks on any other class.
// TH = Amazon only (javelin throw skills)
// S3 = Druid only (Rabies, Hunger)
// KK = Assassin only (Dragon Talon, Dragon Tail)
// S2 = Assassin only (sentry traps and blade skills)
const CLASS_SPECIFIC_ANIMS = new Set(['TH', 'S2', 'KK', 'S3']);

// Skills that cannot be placed on specific classes.
// Charge requires SQ animation + seqinput=8 for smooth client-side movement;
// Necromancer lacks SQ support, so Charge on nec always breaks movement/shake.
const SKILL_CLASS_EXCLUSIONS: Partial<Record<ClassCode, Set<string>>> = {
  nec: new Set(['Charge']),
};

/**
 * Returns true if this skill must stay on its original class:
 * - weapsel=3: requires dual weapons (only Barbarian and Assassin can dual-wield)
 * - itypeb1=h2h/h2h2: requires claw in off-hand (only Assassin can equip claws)
 * - restrict=2: requires shapeshifted form (only Druid can shapeshift)
 * - CLASS_RESTRICTED_TYPES on passiveitype/itypea: class-exclusive weapon types
 * - CLASS_SPECIFIC_ANIMS: animation only exists on the original class
 */
function isPinnedToOriginalClass(skill: SkillEntry): boolean {
  return (
    skill.weapsel === 3 ||
    skill.itypeb1 === 'h2h' ||
    skill.itypeb1 === 'h2h2' ||
    skill.restrict === 2 ||
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
export function placeSkills(
  rng: SeededRNG,
  skills: SkillEntry[],
  treeAssignments: Map<ClassCode, TreePage[]>,
): SkillPlacement[] {
  // Separate pinned skills (must stay on original class) from the shuffle pool
  const pinnedByClass = new Map<ClassCode, SkillEntry[]>();
  const shufflePool: SkillEntry[] = [];
  for (const skill of skills) {
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

  // Distribute shuffled skills to each class, then sort by reqlevel within each class
  let skillIdx = 0;
  for (let ci = 0; ci < CLASS_DEFS.length; ci++) {
    const classDef = CLASS_DEFS[ci];
    const classCode = classDef.code;
    const trees = treeAssignments.get(classCode)!;
    const slotCount = classSlotsCount[ci];

    // Pinned skills for this class stay here; fill remaining slots from the shuffle pool
    const pinned = pinnedByClass.get(classCode) || [];
    if (pinned.length > slotCount) {
      console.error(`Class ${classCode}: ${pinned.length} pinned skills but only ${slotCount} slots — some pinned skills will be dropped`);
    }
    const shuffledCount = Math.max(0, slotCount - pinned.length);
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

    if (classSkills.length < 30) {
      console.warn(`Class ${classCode} only got ${classSkills.length} skills (expected ~30)`);
    }
  }

  if (skillIdx < shuffled.length) {
    console.warn(`${shuffled.length - skillIdx} skills were not placed`);
  }

  resolveExclusions(placements);
  resolveCoplacements(placements);

  return placements;
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
const COPACEMENT_REQUIRES: Record<string, string[]> = {
  'Skeleton Mastery': ['Raise Skeleton', 'Raise Skeletal Mage'],
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
