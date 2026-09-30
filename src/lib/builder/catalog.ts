import { loadSkillDescs, loadSkillStrings, loadSkills, loadTreeGrid } from '@/lib/data-loader';
import type { TreePage } from '@/lib/randomizer/types';
import { type BuildSkill, PAGE_REFS, pageKey } from './class-build';

/** A placeable skill as the builder shows it. Carries the rule fields (BuildSkill) too. */
export interface CatalogSkill extends BuildSkill {
  /** In-game name — "Fire Trauma" in skills.txt shows as "Fire Blast". */
  name: string;
  desc: string;
  /** Icon tile: the skill's own class sheet and vanilla IconCel. */
  iconClass: string;
  iconCel: number;
}

export interface CatalogPage extends TreePage {
  key: string;
  /** The vanilla tree's name, e.g. "Fire Spells". */
  label: string;
}

export interface BuilderCatalog {
  skills: CatalogSkill[];
  /** All 24 pages in PAGE_REFS order. */
  pages: CatalogPage[];
}

// Keyed by page, named by content. (The SkillCategory strings are indexed by
// screen position, and Warlock's don't line up with its skilldesc pages.)
const TREE_NAMES: Record<string, string> = {
  'ama-1': 'Bow and Crossbow', 'ama-2': 'Passive and Magic', 'ama-3': 'Javelin and Spear',
  'sor-1': 'Fire Spells', 'sor-2': 'Lightning Spells', 'sor-3': 'Cold Spells',
  'nec-1': 'Curses', 'nec-2': 'Poison and Bone', 'nec-3': 'Summoning',
  'pal-1': 'Combat Skills', 'pal-2': 'Offensive Auras', 'pal-3': 'Defensive Auras',
  'bar-1': 'Combat Skills', 'bar-2': 'Combat Masteries', 'bar-3': 'Warcries',
  'dru-1': 'Summoning', 'dru-2': 'Shape Shifting', 'dru-3': 'Elemental',
  'ass-1': 'Traps', 'ass-2': 'Shadow Disciplines', 'ass-3': 'Martial Arts',
  'war-1': 'Demon', 'war-2': 'Eldritch', 'war-3': 'Chaos',
};

/**
 * Everything the Class Builder renders, resolved at build time into the static page so
 * a page view makes no API request (see the origin load budget).
 */
export function loadBuilderCatalog(): BuilderCatalog {
  const skillDescs = loadSkillDescs();
  const stringsByKey = new Map(loadSkillStrings().map(s => [s.Key, s.enUS]));
  const localized = (key: string) => {
    const value = stringsByKey.get(key);
    return value && value.trim() ? value : '';
  };

  const skills = loadSkills()
    .map((s): CatalogSkill => {
      const desc = skillDescs.get(s.skilldesc);
      return {
        skill: s.skill,
        id: s.id,
        charclass: s.charclass,
        reqlevel: s.reqlevel,
        ...(s.restrict !== undefined ? { restrict: s.restrict } : {}),
        name: localized(desc?.strName ?? '') || s.skill,
        desc: localized(desc?.strLong ?? '') || localized(desc?.strShort ?? ''),
        iconClass: s.charclass,
        iconCel: desc?.IconCel ?? 0,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const treePages = loadTreeGrid();
  const pages = PAGE_REFS.map(ref => {
    const key = pageKey(ref);
    const page = treePages.get(key);
    if (!page) throw new Error(`Missing tree page ${key}`);
    return { ...page, key, label: TREE_NAMES[key] ?? key };
  });

  return { skills, pages };
}
