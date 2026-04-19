import fs from 'fs';
import path from 'path';
import { ClassCode, TreePage } from '../randomizer/types';
import { CLASS_BY_CODE, SPRITE_CLASSES } from '../randomizer/config';
import { parseSpriteHeader, extractFrame, buildSpriteWithPadding } from './sprite-parser';

export type TreeVariant = 'mkb' | 'controller';

const SPRITES_DIRS: Record<TreeVariant, string> = {
  mkb: path.join(process.cwd(), 'data', 'sprites', 'skill_trees'),
  controller: path.join(process.cwd(), 'data', 'sprites', 'skill_trees_controller'),
};

interface FrameData {
  data: Buffer;
  width: number;
  height: number;
}

/**
 * Cache loaded sprite files to avoid re-reading 13MB files.
 * Stored on globalThis so it survives Next.js module reloads in dev, and (more
 * importantly) so we never drop ~126MB of static game-data reads between
 * requests. The source .sprite files are immutable D2R assets.
 *
 * Cache key is namespaced by variant so M&KB and controller buffers don't
 * collide — the same `amskilltree.sprite` filename exists in both source dirs
 * with different dimensions.
 */
const SPRITE_CACHE_KEY = '__d2r_sprite_cache__';
function getSpriteCache(): Map<string, Buffer> {
  const g = globalThis as Record<string, unknown>;
  if (!g[SPRITE_CACHE_KEY]) g[SPRITE_CACHE_KEY] = new Map<string, Buffer>();
  return g[SPRITE_CACHE_KEY] as Map<string, Buffer>;
}

export function loadSprite(filename: string, variant: TreeVariant = 'mkb'): Buffer {
  const spriteCache = getSpriteCache();
  const cacheKey = `${variant}:${filename}`;
  if (!spriteCache.has(cacheKey)) {
    const filePath = path.join(SPRITES_DIRS[variant], filename);
    spriteCache.set(cacheKey, fs.readFileSync(filePath));
  }
  return spriteCache.get(cacheKey)!;
}

/**
 * Extract a tree frame from a source sprite file.
 * Returns the frame data with its dimensions.
 */
function extractTreeFrame(
  sourceClassCode: string,
  treeIndex: number,
  lowend: boolean,
  variant: TreeVariant = 'mkb',
): FrameData {
  const classDef = CLASS_BY_CODE.get(sourceClassCode as ClassCode);
  if (!classDef) {
    throw new Error(`Unknown class code: ${sourceClassCode}`);
  }

  const suffix = lowend ? '.lowend.sprite' : '.sprite';
  const filename = `${classDef.spritePrefix}skilltree${suffix}`;
  const buf = loadSprite(filename, variant);
  const header = parseSpriteHeader(buf);

  // Sprite frames are stored in reverse order: frame 0 = tree 3, frame 1 = tree 2, frame 2 = tree 1
  const frameIdx = header.frameCount - treeIndex;
  if (frameIdx < 0 || frameIdx >= header.frameCount) {
    throw new Error(`Frame ${frameIdx} out of range for ${filename} (${header.frameCount} frames)`);
  }

  const frameData = extractFrame(buf, header, frameIdx);

  return {
    data: frameData,
    width: header.frameWidth,
    height: header.height,
  };
}

/**
 * Build a skill tree sprite for a class by combining 3 tree page frames
 * from potentially different source classes.
 */
export function stitchTreeSprite(
  trees: TreePage[],
  lowend: boolean,
  variant: TreeVariant = 'mkb',
): Buffer {
  const frames: FrameData[] = [];
  let maxHeight = 0;
  let frameWidth = 0;

  // Extract frames for each tree (tab 0 = tree index 1, tab 1 = tree index 2, tab 2 = tree index 3).
  // All source frames within one variant share frameWidth (e.g. PC = 895, controller = 1259);
  // we never mix variants in a single stitch, so the width assumption holds.
  for (const tree of trees) {
    const frame = extractTreeFrame(tree.classCode, tree.treeIndex, lowend, variant);
    frames.push(frame);
    maxHeight = Math.max(maxHeight, frame.height);
    frameWidth = frame.width;
  }

  // Sprite frames are stored in reverse order: frame 0 = tab 2, frame 1 = tab 1, frame 2 = tab 0
  frames.reverse();

  return buildSpriteWithPadding(frames, frameWidth, maxHeight);
}

/**
 * Build all tree sprites for all classes.
 * Returns a map of filename → Buffer for each output sprite.
 * Returns an empty map if the skill_trees sprite directory is not available.
 */
export function buildAllTreeSprites(
  treeAssignments: Map<ClassCode, TreePage[]>,
  variant: TreeVariant = 'mkb',
): Map<string, Buffer> {
  const results = new Map<string, Buffer>();

  const dir = SPRITES_DIRS[variant];
  if (!fs.existsSync(dir) || fs.readdirSync(dir).length === 0) {
    console.warn(`Skill tree sprites (${variant}) not available — skipping tree sprite generation`);
    return results;
  }

  for (const [classCode, trees] of treeAssignments.entries()) {
    const classDef = CLASS_BY_CODE.get(classCode);
    if (!classDef) continue;

    const prefix = classDef.spritePrefix;

    // Full resolution
    const fullSprite = stitchTreeSprite(trees, false, variant);
    results.set(`${prefix}skilltree.sprite`, fullSprite);

    // Low-end resolution
    const lowendSprite = stitchTreeSprite(trees, true, variant);
    results.set(`${prefix}skilltree.lowend.sprite`, lowendSprite);
  }

  return results;
}

/**
 * No-op kept for backward compatibility. The sprite cache is now global and
 * its contents are static D2R asset buffers — clearing it on every request
 * caused ~126MB of disk re-reads per generation. See getSpriteCache().
 */
export function clearSpriteCache(): void {
  // intentionally empty
}
