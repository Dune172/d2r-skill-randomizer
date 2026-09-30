import type { ClassCode, SkillEntry, SkillPlacement, TreePage } from '../randomizer/types';
import { CLASS_DEFS } from '../randomizer/config';
import { createRNG } from '../randomizer/seed';
import {
  COPACEMENT_REQUIRES,
  HARDCODED_CLASS_SKILLS,
  SKILL_CLASS_EXCLUSIONS,
  orderedFilledSlots,
} from '../randomizer/skill-placer';

/**
 * A single hand-built class from the Class Builder: which vanilla tree page
 * sits on each of its three tabs, and which skill occupies each slot. The other
 * seven classes are randomized from the leftover skills with `seed`
 * (placeSkills' `fixed` option).
 *
 * Browser-safe: the builder page runs validation, fill and the share codec
 * client-side, so nothing here may import Node modules. Server-only pieces
 * (hashing, data loading) live in class-build-server.ts.
 */
export interface PageRef {
  classCode: ClassCode;  // class the page layout, art and arrows come from
  treeIndex: number;     // 1, 2 or 3
}

export interface ClassBuild {
  v: 2;
  classCode: ClassCode;
  /** Index = tabIndex (SkillPage − 1), not screen order. Any page may sit on any tab. */
  pages: [PageRef, PageRef, PageRef];
  /** "tab-row-col" (tab 0-based, row 1-6, col 1-3) → skill name */
  slots: Record<string, string>;
  /** Seeds the randomization of the other seven classes. u32. */
  seed: number;
}

/** The fields the rules need — satisfied by SkillEntry and the page catalog alike. */
export type BuildSkill = Pick<SkillEntry, 'skill' | 'id' | 'charclass' | 'reqlevel' | 'restrict'>;

export const SLOTS_PER_CLASS = 30;

export const slotKey = (tab: number, row: number, col: number) => `${tab}-${row}-${col}`;
export const pageKey = (ref: PageRef) => `${ref.classCode}-${ref.treeIndex}`;

/** All 24 vanilla pages in share-codec order: class (CLASS_DEFS order), then tree. */
export const PAGE_REFS: PageRef[] = CLASS_DEFS.flatMap(d =>
  [1, 2, 3].map(treeIndex => ({ classCode: d.code, treeIndex })),
);

export function isClassCode(code: unknown): code is ClassCode {
  return CLASS_DEFS.some(d => d.code === code);
}

export function classNameOf(code: string): string {
  return CLASS_DEFS.find(d => d.code === code)?.name ?? code;
}

/** A fresh build: the class's own three pages, nothing placed. */
export function emptyBuild(classCode: ClassCode, seed: number): ClassBuild {
  return {
    v: 2,
    classCode,
    pages: [1, 2, 3].map(treeIndex => ({ classCode, treeIndex })) as ClassBuild['pages'],
    slots: {},
    seed: seed >>> 0,
  };
}

export function resolvePages(spec: ClassBuild, treePages: Map<string, TreePage>): TreePage[] | null {
  if (!Array.isArray(spec.pages) || spec.pages.length !== 3) return null;
  const pages = spec.pages.map(ref => (ref ? treePages.get(pageKey(ref)) : undefined));
  return pages.every(Boolean) ? (pages as TreePage[]) : null;
}

/**
 * The class's slot keys in canonical order (row → tab → col). Built on the
 * placer's own orderedFilledSlots so the share codec, the fill order and the
 * placements' skillIndex/iconCel can never disagree about slot order.
 */
export function orderedSlotKeys(pages: TreePage[]): string[] {
  return orderedFilledSlots(pages).map(s => slotKey(s.tabIndex, s.row, s.col));
}

/** Drop assignments whose socket no longer exists on the current pages. */
export function pruneSlots(spec: ClassBuild, pages: TreePage[]): ClassBuild {
  const valid = new Set(orderedSlotKeys(pages));
  const slots = Object.fromEntries(Object.entries(spec.slots).filter(([k]) => valid.has(k)));
  return { ...spec, slots };
}

// ---------------------------------------------------------------------------
// Rules

/** Why `skill` may never sit on `classCode`, or null when it may. */
export function blockReason(skillName: string, classCode: ClassCode): string | null {
  const pinnedTo = HARDCODED_CLASS_SKILLS[skillName];
  if (pinnedTo && pinnedTo !== classCode) {
    return `Only works on ${classNameOf(pinnedTo)} — the game picks its animation by class.`;
  }
  if (SKILL_CLASS_EXCLUSIONS[classCode]?.has(skillName)) {
    return `Breaks movement on ${classNameOf(classCode)}, so it can't be placed there.`;
  }
  return null;
}

/**
 * Skills that only work beside a partner on the same class. Fury and Shock Wave
 * are pinned to Druid and form-gated; the rest are COPACEMENT_REQUIRES.
 */
const FORM_ANCHORS: Record<string, string[]> = { Fury: ['Wearwolf'], 'Shock Wave': ['Wearbear'] };
export function partnersFor(skill: Pick<BuildSkill, 'skill' | 'restrict'>): string[] | null {
  return FORM_ANCHORS[skill.skill]
    ?? COPACEMENT_REQUIRES[skill.skill]
    ?? (skill.restrict === 2 ? ['Wearwolf', 'Wearbear'] : null);
}

export interface BuildIssue {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  slot?: string;
  skill?: string;
}

/**
 * Check a build before it is allowed to generate a mod.
 *
 * Errors mean the mod would be broken or the request is malformed — an empty
 * slot, for instance, leaves the class short of the 30 rows reorderSkillsRows'
 * block arithmetic depends on. Warnings mean the mod works but a skill will be
 * inert where it is. `requireComplete: false` is the editing view: empty slots
 * are simply not reported.
 */
export function checkClassBuild(
  spec: ClassBuild,
  skills: BuildSkill[],
  treePages: Map<string, TreePage>,
  { requireComplete = true }: { requireComplete?: boolean } = {},
): BuildIssue[] {
  const issues: BuildIssue[] = [];
  const err = (code: string, message: string, extra: Partial<BuildIssue> = {}) =>
    issues.push({ severity: 'error', code, message, ...extra });

  if (spec?.v !== 2) {
    err('bad_version', `Unsupported build format: ${spec?.v}`);
    return issues;
  }
  if (!isClassCode(spec.classCode)) {
    err('bad_class', 'Unknown class.');
    return issues;
  }
  if (!Number.isInteger(spec.seed) || spec.seed < 0 || spec.seed > 0xffffffff) {
    err('bad_seed', 'Invalid seed.');
  }
  const pages = resolvePages(spec, treePages);
  if (!pages) {
    err('bad_pages', 'Each tab needs one of the 24 vanilla tree pages.');
    return issues;
  }

  const className = classNameOf(spec.classCode);
  const byName = new Map(skills.map(s => [s.skill, s]));
  const keys = orderedSlotKeys(pages);
  const validKeys = new Set(keys);
  const slots = spec.slots ?? {};

  for (const key of Object.keys(slots)) {
    if (!validKeys.has(key)) err('invalid_slot', `"${key}" is not a slot on the chosen tree pages.`, { slot: key });
  }

  const seen = new Set<string>();
  for (const key of keys) {
    const name = slots[key];
    if (!name) {
      if (requireComplete) {
        const [tab, row, col] = key.split('-').map(Number);
        err('empty_slot', `Tab ${tab + 1}, row ${row}, column ${col} is empty.`, { slot: key });
      }
      continue;
    }
    if (!byName.has(name)) {
      err('unknown_skill', `"${name}" is not a class skill.`, { slot: key, skill: name });
      continue;
    }
    if (seen.has(name)) err('duplicate_skill', `"${name}" is placed more than once.`, { slot: key, skill: name });
    seen.add(name);
    const blocked = blockReason(name, spec.classCode);
    if (blocked) err('blocked_skill', `"${name}": ${blocked}`, { slot: key, skill: name });
  }

  for (const key of keys) {
    const skill = byName.get(slots[key]);
    if (!skill) continue;
    const partners = partnersFor(skill);
    if (!partners || partners.some(p => seen.has(p))) continue;
    issues.push({
      severity: 'warning',
      code: 'missing_partner',
      slot: key,
      skill: skill.skill,
      message: `"${skill.skill}" does nothing without ${partners.map(p => `"${p}"`).join(' or ')} on ${className}.`,
    });
  }

  return issues;
}

export const hasErrors = (issues: BuildIssue[]) => issues.some(i => i.severity === 'error');

// ---------------------------------------------------------------------------
// Fill

/**
 * Fill every empty slot, keeping what the player placed. Picks only skills that
 * are allowed on the class and would work there (partner skills only when a
 * partner is already present), then lays them out lowest required level first,
 * the way random seeds do. Deterministic in `fillSeed`.
 */
export function fillEmptySlots(
  spec: ClassBuild,
  skills: BuildSkill[],
  treePages: Map<string, TreePage>,
  fillSeed: number,
): ClassBuild {
  const pages = resolvePages(spec, treePages);
  if (!pages) return spec;
  const keys = orderedSlotKeys(pages);
  const empty = keys.filter(k => !spec.slots[k]);
  if (empty.length === 0) return spec;

  const placed = new Set(Object.values(spec.slots));
  const rng = createRNG(fillSeed);
  const pool = rng.shuffle(
    skills.filter(s => !placed.has(s.skill) && !blockReason(s.skill, spec.classCode)),
  );

  const picked: BuildSkill[] = [];
  const has = (name: string) => placed.has(name) || picked.some(p => p.skill === name);
  // Two passes so a partner picked late still lets its dependants in.
  for (let pass = 0; pass < 2 && picked.length < empty.length; pass++) {
    for (const s of pool) {
      if (picked.length >= empty.length) break;
      if (has(s.skill)) continue;
      const partners = partnersFor(s);
      if (partners && !partners.some(has)) continue;
      picked.push(s);
    }
  }

  picked.sort((a, b) => a.reqlevel - b.reqlevel);
  const slots = { ...spec.slots };
  empty.forEach((key, i) => { if (picked[i]) slots[key] = picked[i].skill; });
  return { ...spec, slots };
}

// ---------------------------------------------------------------------------
// Placements

/**
 * Turn a validated, complete build into the placements placeSkills keeps fixed.
 * skillIndex is the compacted slot rank and iconCel = 2 × rank, exactly as
 * placeSkills assigns them — the icon sprite assembler relies on it.
 */
export function buildFixedPlacements(
  spec: ClassBuild,
  skills: SkillEntry[],
  treePages: Map<string, TreePage>,
): { pages: TreePage[]; placements: SkillPlacement[] } {
  const pages = resolvePages(spec, treePages);
  if (!pages) throw new Error('Build references unknown tree pages');
  const byName = new Map(skills.map(s => [s.skill, s]));
  const placements = orderedFilledSlots(pages).map((slot, rank) => {
    const name = spec.slots[slotKey(slot.tabIndex, slot.row, slot.col)];
    const skill = name ? byName.get(name) : undefined;
    if (!skill) throw new Error(`Build slot ${slotKey(slot.tabIndex, slot.row, slot.col)} is empty or unknown`);
    return {
      skill,
      targetClass: spec.classCode,
      treePage: slot.tree,
      tabIndex: slot.tabIndex,
      row: slot.row,
      col: slot.col,
      iconCel: rank * 2,
      skillIndex: rank,
    };
  });
  return { pages, placements };
}
