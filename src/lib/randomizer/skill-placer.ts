import { ClassCode, SkillEntry, SkillPlacement, TreePage } from './types';
import { SeededRNG } from './seed';
import { CLASS_DEFS } from './config';

// Skills that cannot be placed on specific classes.
// Charge requires SQ animation + seqinput=8 for smooth client-side movement;
// Necromancer lacks SQ support, so Charge on nec always breaks movement/shake.
//
// Zeal (srvdofunc=13/cltdofunc=21) fires multiple hits on A1 frame events.
// On classes without A1 (sor, nec, war), pickBestAnim falls back to SQ, which
// means mana drains once but the multi-swing never triggers.
//
// Sacrifice (cltdofunc=34) is a Paladin-hardcoded client handler timed to A1
// frame events. On classes without A1 (sor, war), pickBestAnim falls back to
// SQ and the A1 event never fires, so no attack animation plays.
const SKILL_CLASS_EXCLUSIONS: Partial<Record<ClassCode, Set<string>>> = {
  nec: new Set(['Charge', 'Zeal']),
  sor: new Set(['Zeal', 'Sacrifice']),
  war: new Set(['Zeal', 'Sacrifice']),
};

// Skills pinned to their native class. Each entry is (a) pinned to its native
// class (never shuffled to another class), (b) row-pinned at its vanilla
// skills.txt row index (so engine-hardcoded row-position animation lookups
// still resolve), and (c) subject to a seeded 50% coin-flip drop in
// placeSkills — when the flip fails, the skill is dropped from the seed and
// a substitute (another pool skill's mechanics cloned into this row, keeping
// the dropped skill's name/*Id/skilldesc identity) fills its tree slot.
//
// Membership rationale: either the skill's mechanics are only executable on
// its native class (weapsel=3 dual-wield, h2h claws, Assassin-only KK anim)
// OR the engine resolves its animation handler by vanilla row position.
// Both cases boil down to "must stay home".
//
// Most shapeshift-only skills (restrict=2: Maul, Feral Rage, Fire Claws,
// Hunger, Rabies) and the Shape Shifting passive are intentionally NOT
// listed here — they go in the shuffle pool so COPACEMENT_REQUIRES can
// co-locate them with whichever class hosts Wearwolf/Wearbear.
//
// Exception: Fury (cltdofunc=21) and Shock Wave (cltdofunc=17) ARE pinned
// despite restrict=2. The wolf/bear form model owns its own anim sheet, but
// the engine's client handler dispatch is keyed on the host character class,
// not the active form. Fury's cltdofunc=21 is the same Druid-class-gated
// handler family as Zeal (Paladin/cltdofunc=21) and Strafe (Amazon/cltdofunc=20):
// on a non-Druid host, no handler fires, so no animation start signal and
// no attack — even though anim=A1 is preserved correctly. Shock Wave is
// pinned for the same reason on the Wearbear side. See FORM_GATED_PINS
// in placeSkills for the conditional-drop logic that vacates them when
// the form anchor (Wearwolf / Wearbear) didn't land on Druid.
export const HARDCODED_CLASS_SKILLS: Readonly<Record<string, ClassCode>> = {
  // Amazon
  'Fend': 'ama',
  'Strafe': 'ama',
  'Jab': 'ama',
  // Barbarian
  'Leap': 'bar',
  'Leap Attack': 'bar',
  'Whirlwind': 'bar',
  'Double Swing': 'bar',
  'Double Throw': 'bar',
  'Frenzy': 'bar',
  // Sorceress
  'Inferno': 'sor',
  // Paladin
  'Zeal': 'pal',
  // Druid
  'Arctic Blast': 'dru',
  'Fury': 'dru',
  'Shock Wave': 'dru',
  // Assassin
  'Dragon Flight': 'ass',
  'Dragon Talon': 'ass',
  'Dragon Tail': 'ass',
  'Fists of Fire': 'ass',
  'Claws of Thunder': 'ass',
  'Blades of Ice': 'ass',
  'Dragon Claw': 'ass',
  'Claw Mastery': 'ass',
  'Weapon Block': 'ass',
};

// Skills outside HARDCODED_CLASS_SKILLS that still get the seeded 50% drop
// coin flip. Used for shapeshift-form attack skills: when kept, they go in
// the shuffle pool and are funneled to the form-host class via
// COPACEMENT_REQUIRES; when dropped, a substitute fills their slot on Druid
// (their native class) — same display-identity-with-borrowed-mechanics
// pattern as HARDCODED drops. The Shape Shifting passive is intentionally
// not droppable: it's a strategic linchpin for the shapeshift kit.
//
// Fury and Shock Wave are NOT here — they're pinned via HARDCODED_CLASS_SKILLS
// because their cltdofunc handlers are class-gated by the engine.
export const COIN_FLIP_DROP_SKILLS: ReadonlySet<string> = new Set([
  // Werewolf-only attacks
  'Feral Rage', 'Rabies',
  // Werebear-only attacks
  'Maul',
  // Either-form attacks
  'Fire Claws', 'Hunger',
]);

/**
 * Shuffle all 240 class skills and assign them to FILLED grid slots
 * across all 8 classes' assigned tree pages.
 * Skills listed in HARDCODED_CLASS_SKILLS are pinned to their native class
 * (and subject to a seeded 50% coin-flip drop); all others are shuffled.
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
    // Coin-flip drops outside HARDCODED_CLASS_SKILLS (shapeshift-form attacks).
    // Substitute lands on the skill's native class (dru).
    if (COIN_FLIP_DROP_SKILLS.has(skill.skill) && rng.next() >= 0.5) {
      const cls = skill.charclass as ClassCode;
      if (!droppedSkillsByClass.has(cls)) droppedSkillsByClass.set(cls, []);
      droppedSkillsByClass.get(cls)!.push(skill);
      droppedSkillNames.add(skill.skill);
      continue;
    }
    keptSkills.push(skill);
  }

  // Separate pinned skills (must stay on original class) from the shuffle pool
  const pinnedByClass = new Map<ClassCode, SkillEntry[]>();
  const shufflePool: SkillEntry[] = [];
  for (const skill of keptSkills) {
    if (skill.skill in HARDCODED_CLASS_SKILLS) {
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

  // Conditional drop for class-gated form attacks: Fury (cltdofunc=21) and
  // Shock Wave (cltdofunc=17) are pinned to Druid because their engine handlers
  // are class-keyed. But they're restrict=2, so they need their form anchor
  // (Wearwolf for Fury, Wearbear for Shock Wave) on the same class to be
  // usable. If the form anchor traveled to a different class via the shuffle,
  // the pinned attack would be a dead skill on Druid — drop it so the slot
  // gets a substitute instead. (This runs before substitute injection so the
  // existing substitute logic picks up the new vacated slots uniformly.)
  const FORM_GATED_PINS: ReadonlyArray<{ skill: string; anchor: string }> = [
    { skill: 'Fury', anchor: 'Wearwolf' },
    { skill: 'Shock Wave', anchor: 'Wearbear' },
  ];
  for (const { skill: gatedSkill, anchor } of FORM_GATED_PINS) {
    const gatedIdx = placements.findIndex(p => p.skill.skill === gatedSkill);
    if (gatedIdx === -1) continue; // already dropped (HARDCODED coin-flip or excluded)
    const anchorPlacement = placements.find(p => p.skill.skill === anchor);
    if (!anchorPlacement) continue; // anchor missing entirely — nothing to align against
    if (anchorPlacement.targetClass === 'dru') continue; // anchor on Druid — keep gated skill
    // Anchor traveled — drop the gated skill, vacate its slot for substitute injection.
    const dropped = placements[gatedIdx];
    placements.splice(gatedIdx, 1);
    droppedSkillNames.add(gatedSkill);
    if (!droppedSkillsByClass.has('dru')) droppedSkillsByClass.set('dru', []);
    droppedSkillsByClass.get('dru')!.push(dropped.skill);
    if (!vacatedByClass.has('dru')) vacatedByClass.set('dru', []);
    vacatedByClass.get('dru')!.push({
      tabIndex: dropped.tabIndex,
      tree: dropped.treePage,
      row: dropped.row,
      col: dropped.col,
      iconCel: dropped.iconCel,
      skillIndex: dropped.skillIndex,
    });
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
  resolveCoplacements(placements, droppedSkillNames);

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

      // Can't pull a pinned skill off its native class.
      if (partner.skill.skill in HARDCODED_CLASS_SKILLS) continue;

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
// Shapeshift-only (restrict=2) skills are split by which form they actually
// work in (per their skilldesc / D2 engine):
//   wolf-only : Feral Rage, Fury, Rabies
//   bear-only : Maul, Shock Wave
//   either    : Fire Claws, Hunger, Shape Shifting (passive)
// Peer order matters: the FIRST peer found in the placement list wins as the
// destination class, so when both forms land on different classes, "either"
// skills follow Wearwolf by default (unless they already happen to share a
// class with Wearbear, in which case the existing-satisfaction check skips
// the swap).
const COPACEMENT_REQUIRES: Record<string, string[]> = {
  'Skeleton Mastery': ['Raise Skeleton', 'Raise Skeletal Mage'],
  // Werewolf-only (Fury is pinned via HARDCODED_CLASS_SKILLS, not here)
  'Feral Rage': ['Wearwolf'],
  'Rabies': ['Wearwolf'],
  // Werebear-only (Shock Wave is pinned via HARDCODED_CLASS_SKILLS, not here)
  'Maul': ['Wearbear'],
  // Either form
  'Fire Claws': ['Wearwolf', 'Wearbear'],
  'Hunger': ['Wearwolf', 'Wearbear'],
  'Shape Shifting': ['Wearwolf', 'Wearbear'],
};

/**
 * Ensure co-placement constraints are satisfied after initial placement.
 * For each constrained skill, if none of its required peers landed on the same
 * class, move it to a class that does have a peer by swapping it with a skill
 * from that class (excluding the peer itself).
 */
function resolveCoplacements(placements: SkillPlacement[], droppedSkillNames: Set<string>): void {
  // Build skill name → placement index for quick lookup
  const bySkill = new Map<string, number>();
  for (let i = 0; i < placements.length; i++) {
    bySkill.set(placements[i].skill.skill, i);
  }

  // Other coplacement-key skills can't serve as swap partners: otherwise
  // processing Hunger after Rabies could pick Rabies as its partner and
  // undo Rabies's swap (and vice versa).
  const COPACEMENT_KEYS = new Set(Object.keys(COPACEMENT_REQUIRES));
  // Peer anchors (Wearwolf, Wearbear, Raise Skeleton, etc.) can't serve as
  // swap partners either: moving Wearwolf to satisfy Maul's ['Wearbear']
  // constraint would orphan all the wolf-only skills that anchored on it.
  const COPACEMENT_PEERS = new Set(Object.values(COPACEMENT_REQUIRES).flat());

  for (const [skillName, peers] of Object.entries(COPACEMENT_REQUIRES)) {
    // Substitutes inherit the dropped skill's name but have borrowed mechanics
    // from a random source. They're cosmetic placeholders — relocating them
    // would put a fake-mechanics tile on the form-host class while the
    // identity slot on the drop-target class gets backfilled with an
    // unrelated partner skill.
    if (droppedSkillNames.has(skillName)) continue;

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
      if (partner.skill.skill in HARDCODED_CLASS_SKILLS) continue;
      // Can't use another coplacement-key skill as a partner (would undo its swap).
      if (COPACEMENT_KEYS.has(partner.skill.skill)) continue;
      // Can't move a peer anchor (would orphan other constraints that depend on it).
      if (COPACEMENT_PEERS.has(partner.skill.skill)) continue;

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
