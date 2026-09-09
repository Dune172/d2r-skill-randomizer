// The spoiler/preview computation, lifted out of the /api/preview route so a
// server component can render it into the page instead of every visitor's
// browser fetching it. Cloudflare will not cache anything under /api/, so each
// of those fetches was an unavoidable origin hit; the challenge page's preview
// is the same bytes for a whole 14-day cycle, which makes it pure waste.
//
// Output is a pure function of (seed, maskSkills, weekNumber). The memo below
// is shared by the route and by ISR page renders, so the work happens once per
// distinct input per process rather than once per request. Entries run ~200 KB;
// the cap holds this well under 10 MB and Map insertion order is the eviction
// queue.
import { createRNG } from '@/lib/randomizer/seed';
import { loadTreeGrid, loadSkills, loadSkillDescs, loadSkillStrings } from '@/lib/data-loader';
import { randomizeTrees } from '@/lib/randomizer/tree-randomizer';
import { placeSkills, groupByClass } from '@/lib/randomizer/skill-placer';
import { CLASS_DEFS } from '@/lib/randomizer/config';
import { MYSTERY_ICON } from '@/lib/randomizer/mutations/mystery-box';
import { getMutationExcludedSkills } from '@/lib/randomizer/mutations';
import { PreviewData, SkillEntry } from '@/lib/randomizer/types';

const PREVIEW_CACHE_MAX = 32;
const previewCache = new Map<string, string>();

export function buildPreviewData(
  seed: number,
  maskSkills: boolean,
  weekNumber: number,
): PreviewData {
  const rng = createRNG(seed);

  // Load data
  const treePages = loadTreeGrid();
  const skills = loadSkills();

  // Randomize
  const treeAssignments = randomizeTrees(rng, treePages);
  const excludeSkills = getMutationExcludedSkills(weekNumber);
  const { placements, substitutes } = placeSkills(rng, skills, treeAssignments,
    excludeSkills.size > 0 ? { excludeSkills } : undefined);
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

  // Build preview data
  const preview: PreviewData = {
    seed,
    masked: maskSkills,
    classes: CLASS_DEFS.map(classDef => ({
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

  return preview;
}

/** Memoized serialized preview — what /api/preview returns verbatim. */
export function getPreviewJson(seed: number, maskSkills: boolean, weekNumber: number): string {
  const key = `${seed}|${maskSkills ? 1 : 0}|${weekNumber}`;
  const hit = previewCache.get(key);
  if (hit !== undefined) return hit;

  const json = JSON.stringify(buildPreviewData(seed, maskSkills, weekNumber));
  if (previewCache.size >= PREVIEW_CACHE_MAX) {
    const oldest = previewCache.keys().next().value;
    if (oldest !== undefined) previewCache.delete(oldest);
  }
  previewCache.set(key, json);
  return json;
}

/** Memoized preview object, for server components rendering it into a page. */
export function getPreviewData(seed: number, maskSkills: boolean, weekNumber: number): PreviewData {
  return JSON.parse(getPreviewJson(seed, maskSkills, weekNumber)) as PreviewData;
}
