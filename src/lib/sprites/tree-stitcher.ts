import fs from 'fs';
import path from 'path';
import { ClassCode, TreePage } from '../randomizer/types';
import { CLASS_BY_CODE, CLASS_DEFS, SPRITE_CLASSES } from '../randomizer/config';
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
 * First row of page artwork in each tree frame. Everything above it is the tab
 * strip (baked into every frame, with that frame's own tab drawn as selected)
 * plus chrome that is identical across all of a class's frames.
 *
 * Measured from the source sprites: rows above the cut never differ between
 * source classes of the same strip style, and the rows between the strip and
 * the artwork are identical across a class's three frames, so any cut in that
 * gap is seamless. Controller lowend has no gap — row 62 carries both the last
 * strip row and the first art row — so it keeps the art row.
 */
const TAB_STRIP_ROWS: Record<TreeVariant, { full: number; lowend: number }> = {
  mkb: { full: 113, lowend: 57 },
  controller: { full: 129, lowend: 62 },
};

/**
 * Build a skill tree sprite for a class by combining 3 tree page frames
 * from potentially different source classes.
 *
 * A page can sit on any tab (the Class Builder allows it). Because the tab
 * strip is part of the page's frame, a tree-3 page on tab 1 would show tab 3
 * as selected; in that case the strip is taken from the same source class's
 * frame for the tab it actually sits on. Pages on their own tab — every seed —
 * are passed through untouched.
 */
export function stitchTreeSprite(
  trees: TreePage[],
  lowend: boolean,
  variant: TreeVariant = 'mkb',
): Buffer {
  const frames: FrameData[] = [];
  let maxHeight = 0;
  let frameWidth = 0;

  // Extract frames for each tab in order (tab 0 first).
  // All source frames within one variant share frameWidth (e.g. PC = 895, controller = 1259);
  // we never mix variants in a single stitch, so the width assumption holds.
  for (let tab = 0; tab < trees.length; tab++) {
    const tree = trees[tab];
    const frame = extractTreeFrame(tree.classCode, tree.treeIndex, lowend, variant);
    if (tree.treeIndex !== tab + 1) {
      const strip = extractTreeFrame(tree.classCode, tab + 1, lowend, variant);
      const rows = TAB_STRIP_ROWS[variant][lowend ? 'lowend' : 'full'];
      strip.data.copy(frame.data, 0, 0, rows * frame.width * 4);
    }
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

  // Check if lowend source sprites are present for this variant.
  // On the production server only the full-res .sprite files are deployed;
  // if lowend files are absent we skip their generation entirely and let
  // D2R fall back to its vanilla lowend assets.
  const hasLowend = fs.existsSync(
    path.join(dir, `${CLASS_DEFS[0].spritePrefix}skilltree.lowend.sprite`)
  );
  if (!hasLowend) {
    console.warn(`Lowend sprites (${variant}) not available — skipping lowend tree sprite generation`);
  }

  for (const [classCode, trees] of treeAssignments.entries()) {
    const classDef = CLASS_BY_CODE.get(classCode);
    if (!classDef) continue;

    const prefix = classDef.spritePrefix;

    // Full resolution
    const fullSprite = stitchTreeSprite(trees, false, variant);
    results.set(`${prefix}skilltree.sprite`, fullSprite);

    // Low-end resolution (only when source lowend files are deployed)
    if (hasLowend) {
      const lowendSprite = stitchTreeSprite(trees, true, variant);
      results.set(`${prefix}skilltree.lowend.sprite`, lowendSprite);
    }
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
