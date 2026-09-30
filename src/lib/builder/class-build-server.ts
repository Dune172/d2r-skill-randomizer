import crypto from 'crypto';
import { loadSkills, loadTreeGrid } from '@/lib/data-loader';
import type { FixedClass } from '@/lib/randomizer/skill-placer';
import type { TreePage } from '@/lib/randomizer/types';
import { type BuildIssue, type ClassBuild, buildFixedPlacements, checkClassBuild, hasErrors } from './class-build';
import { CodecError, decodeClassBuild, encodeClassBuild } from './class-build-codec';

/** A share code that can't be built — the message is safe to show the player. */
export class BuildRequestError extends Error {}

export interface ResolvedClassBuild {
  spec: ClassBuild;
  /** Canonical share code: the build's identity in the cache key. */
  code: string;
  seed: number;
  /**
   * Mod folder name. Hashed from the code rather than taken from the seed:
   * two different builds may share a seed, and must never overwrite each
   * other's install.
   */
  modName: string;
  fixed: FixedClass;
  pages: TreePage[];
  warnings: BuildIssue[];
}

/**
 * Decode, validate and canonicalize a share code into everything the pipeline
 * needs. /api/randomize, /api/download and /api/preview all go through here,
 * so they agree on the seed and cache identity by construction.
 */
export function resolveClassBuild(rawCode: unknown): ResolvedClassBuild {
  if (typeof rawCode !== 'string' || rawCode.length === 0 || rawCode.length > 128) {
    throw new BuildRequestError('Missing or malformed build code.');
  }
  const skills = loadSkills();
  const treePages = loadTreeGrid();
  let spec: ClassBuild;
  try {
    spec = decodeClassBuild(rawCode, skills, treePages);
  } catch (e) {
    if (e instanceof CodecError) throw new BuildRequestError(e.message);
    throw e;
  }
  const issues = checkClassBuild(spec, skills, treePages);
  if (hasErrors(issues)) {
    throw new BuildRequestError(issues.find(i => i.severity === 'error')!.message);
  }
  const code = encodeClassBuild(spec, skills, treePages);
  const { pages, placements } = buildFixedPlacements(spec, skills, treePages);
  const hash = crypto.createHash('sha256').update(code).digest('hex').slice(0, 8);
  return {
    spec,
    code,
    seed: spec.seed,
    modName: `build${hash}`,
    fixed: { classCode: spec.classCode, placements },
    pages,
    warnings: issues,
  };
}
