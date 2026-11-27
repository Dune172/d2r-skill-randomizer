/**
 * The skill-tree spoiler: which pages each class gets and which skill sits in each
 * cell, with player-facing names, descriptions and icons. Server-only (reads the
 * game data files).
 *
 * Shared by POST /api/preview and the server-rendered challenge pages
 * (/archive/[challenge]), so a crawler or visitor gets the layout in the HTML
 * without an API call (see the origin load budget).
 */
import { createRNG } from './seed';
import { loadTreeGrid, loadSkills, loadSkillDescs, loadSkillStrings } from '@/lib/data-loader';
import { groupByClass } from './skill-placer';
import { runPlacement } from './placement-step';
import { activeClassDefs } from './config';
import { MYSTERY_ICON } from './mutations/mystery-box';
import { getMutationExcludedSkillsFor, hasMutation } from './mutations';
import { getMutationIds } from '@/lib/mutations/registry';
import { getWeekSeed } from '@/lib/challenge/week';
import type { ResolvedClassBuild } from '@/lib/builder/class-build-server';
import type { PreviewData, SkillEntry } from './types';

export type PreviewInput = {
  seed: number;
  mutationIds: readonly number[];
  /** Hide skill identities (Mystery Box, or the caller asked for it). */
  maskSkills: boolean;
  classBuild?: ResolvedClassBuild | null;
  baseGame?: boolean;
  /** From shuffleShareOf; undefined is a full shuffle. */
  shuffleShare?: number;
};

/** Forgotten Arts disables skill trees, so there is no layout to show. */
export type ForgottenArtsPreview = { seed: number; masked: false; classes: []; mode: 'forgotten-arts' };

export function buildPreview(input: PreviewInput): PreviewData | ForgottenArtsPreview {
  const { seed, mutationIds, classBuild, baseGame = false } = input;
  const maskSkills = input.maskSkills || hasMutation(mutationIds, 'mystery-box');
  if (hasMutation(mutationIds, 'forgotten-arts')) {
    return { seed, masked: false, classes: [], mode: 'forgotten-arts' };
  }
  const classDefs = activeClassDefs(baseGame);
  const rng = createRNG(seed);

  const treePages = loadTreeGrid();
  const skills = loadSkills();

  const { treeAssignments, placements, substitutes } = runPlacement(rng, {
    treePages,
    skills,
    excludeSkills: getMutationExcludedSkillsFor(mutationIds),
    build: classBuild ?? undefined,
    shuffleShare: input.shuffleShare,
    ...(baseGame ? { classes: classDefs } : {}),
  });
  const placementsByClass = groupByClass(placements);

  // Resolve in-game (player-facing) display data: skill → skilldesc → str name /
  // str long → localized string. Internal skills.txt names like "Fire Trauma" map
  // to "Fire Blast" in-game; the preview should show what the player will actually see.
  const skillDescs = loadSkillDescs();
  const stringsByKey = new Map(loadSkillStrings().map(s => [s.Key, s.enUS]));

  // Substitute slots keep the dropped skill's identity, but the mod output
  // overwrites that row's display columns with the SOURCE skill's — so name,
  // description and icon must all be read under the source's skilldesc.
  //
  // Substitution can CHAIN: sources are drawn from `placements`, which already
  // contains earlier substitutes, so sub.sourceSkill.skilldesc can itself name
  // an earlier DROPPED skill. Following only one hop reads the INTERMEDIATE
  // skill's vanilla entry, which yields the wrong name and an icon sliced from
  // the right class at the wrong IconCel. Same bug as v0.258, which fixed it for
  // the mod output (api/randomize/route.ts:208-246) but not for this spoiler.
  // Chains are acyclic by construction (a sub's source predates it); the
  // seen-guard is insurance.
  const subSourceDesc = new Map<string, string>();
  for (const sub of substitutes) {
    subSourceDesc.set(sub.droppedSkill.skilldesc, sub.sourceSkill.skilldesc);
  }
  const resolveSourceDesc = (desc: string): string => {
    const seen = new Set<string>();
    while (subSourceDesc.has(desc) && !seen.has(desc)) {
      seen.add(desc);
      desc = subSourceDesc.get(desc)!;
    }
    return desc;
  };

  const localized = (key: string): string => {
    const value = stringsByKey.get(key);
    return value && value.trim() ? value : '';
  };

  // One resolved entry drives name, description AND icon, so the three can
  // never disagree with each other or with the generated ZIP.
  const resolveDisplay = (skill: SkillEntry) => {
    const effective = skillDescs.get(resolveSourceDesc(skill.skilldesc));
    return {
      name: localized(effective?.strName ?? '') || skill.skill,
      // ~9 of 263 skilldescs define neither string; fall through to ''.
      desc: localized(effective?.strLong ?? '') || localized(effective?.strShort ?? ''),
      // charclass is transitively correct: the synthetic substitute SkillEntry
      // spreads the source's charclass (skill-placer.ts), which is the same
      // class sheet buildClassIconSprite() slices for the mod.
      iconClass: skill.charclass,
      iconCel: effective?.IconCel ?? 0,
    };
  };

  return {
    seed,
    masked: maskSkills,
    classes: classDefs.map(classDef => ({
      code: classDef.code,
      name: classDef.name,
      tabs: (treeAssignments.get(classDef.code) || []).map((tree, tabIdx) => {
        const classPlacs = (placementsByClass.get(classDef.code) || [])
          .filter(p => p.tabIndex === tabIdx);

        return {
          sourceClass: tree.className,
          sourceTree: tree.treeIndex,
          skills: classPlacs.map(p => {
            const display = resolveDisplay(p.skill);
            return {
              name: maskSkills ? '???' : display.name,
              desc: maskSkills ? '' : display.desc,
              originalClass: maskSkills ? '?' : p.skill.charclass,
              // Under Mystery Box every cell shows the one icon the mod
              // overrides every frame with, so the spoiler matches the game.
              iconClass: maskSkills ? MYSTERY_ICON.charclass : display.iconClass,
              iconCel: maskSkills ? MYSTERY_ICON.iconCel : display.iconCel,
              row: p.row,
              col: p.col,
            };
          }),
        };
      }),
    })),
  };
}

const challengeCache = new Map<number, PreviewData | ForgottenArtsPreview>();

/**
 * A challenge's spoiler, exactly as POST /api/preview returns it for
 * `{ seed: getWeekSeed(n), weekNumber: n }`. Challenges are always full-shuffle
 * Reign of the Warlock mods. Memoized: a challenge's layout never changes.
 */
export function challengePreview(challenge: number): PreviewData | ForgottenArtsPreview {
  let preview = challengeCache.get(challenge);
  if (!preview) {
    preview = buildPreview({
      seed: getWeekSeed(challenge),
      mutationIds: getMutationIds(challenge),
      maskSkills: false,
    });
    challengeCache.set(challenge, preview);
  }
  return preview;
}
