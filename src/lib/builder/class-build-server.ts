import crypto from 'crypto';
import { loadSkills, loadTreeGrid } from '@/lib/data-loader';
import type { FixedClass } from '@/lib/randomizer/skill-placer';
import type { TreePage } from '@/lib/randomizer/types';
import { type BuildIssue, type ClassBuild, buildFixedPlacements, checkClassBuildSet, hasErrors, skillsInBuilds } from './class-build';
import { CodecError, decodeClassBuildSet, encodeClassBuildSet } from './class-build-codec';

/** A share code that can't be built — the message is safe to show the player. */
export class BuildRequestError extends Error {}

/** Longest share code accepted: eight classes are 362 characters. */
const MAX_CODE_LENGTH = 400;

export interface ResolvedClassBuild {
  /** Every hand-built class, in CLASS_DEFS order. Usually one. */
  specs: ClassBuild[];
  /** Canonical share code: the build's identity in the cache key. */
  code: string;
  seed: number;
  /**
   * Mod folder name. Hashed from the code rather than taken from the seed:
   * two different builds may share a seed, and must never overwrite each
   * other's install.
   */
  modName: string;
  /** What placeSkills keeps fixed and the pages each class's tabs use. */
  classes: { fixed: FixedClass; pages: TreePage[] }[];
  /** Every skill placed by hand, on any class. */
  skillNames: string[];
  warnings: BuildIssue[];
}

/**
 * Whether a build has the Warlock or any Warlock skill. A base-game mod (no Reign of
 * the Warlock, src/lib/base-game.ts) can't hold either: the base tables have no
 * Warlock skill descriptions.
 */
export function buildUsesWarlock(build: Pick<ResolvedClassBuild, 'specs' | 'skillNames'>): boolean {
  if (build.specs.some(spec => spec.classCode === 'war')) return true;
  const warlockSkills = new Set(loadSkills().filter(s => s.charclass === 'war').map(s => s.skill));
  return build.skillNames.some(name => warlockSkills.has(name));
}

/**
 * Decode, validate and canonicalize a share code into everything the pipeline
 * needs. /api/randomize, /api/download and /api/preview all go through here,
 * so they agree on the seed and cache identity by construction.
 */
export function resolveClassBuild(rawCode: unknown): ResolvedClassBuild {
  if (typeof rawCode !== 'string' || rawCode.length === 0 || rawCode.length > MAX_CODE_LENGTH) {
    throw new BuildRequestError('Missing or malformed build code.');
  }
  const skills = loadSkills();
  const treePages = loadTreeGrid();
  let specs: ClassBuild[];
  try {
    specs = decodeClassBuildSet(rawCode, skills, treePages);
  } catch (e) {
    if (e instanceof CodecError) throw new BuildRequestError(e.message);
    throw e;
  }
  const issues = checkClassBuildSet(specs, skills, treePages);
  if (hasErrors(issues)) {
    throw new BuildRequestError(issues.find(i => i.severity === 'error')!.message);
  }
  const code = encodeClassBuildSet(specs, skills, treePages);
  // Re-read from the canonical code so the classes are in CLASS_DEFS order.
  specs = decodeClassBuildSet(code, skills, treePages);
  const classes = specs.map(spec => {
    const { pages, placements } = buildFixedPlacements(spec, skills, treePages);
    return { fixed: { classCode: spec.classCode, placements }, pages };
  });
  const hash = crypto.createHash('sha256').update(code).digest('hex').slice(0, 8);
  return {
    specs,
    code,
    seed: specs[0].seed,
    modName: `build${hash}`,
    classes,
    skillNames: [...skillsInBuilds(specs)],
    warnings: issues,
  };
}
