import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
// Generation is serialized upstream by enqueueGeneration (single-flight), so we
// don't need to cap libvips threads to 1 for safety. 2 threads cut sprite
// compositing roughly in half on a 2-vCPU box. Override via VIPS_CONCURRENCY
// env var if hosting gets tighter.
sharp.concurrency(2);
// Keep the op cache in memory only (no filesystem temp files). Icon RGBA
// buffers are already globally cached; this helps repeat composite ops.
sharp.cache({ memory: 50, items: 200, files: 0 });
import { ClassCode, SkillPlacement } from '../randomizer/types';
import { CLASS_BY_CODE, ICON_WIDTH, ICON_HEIGHT, ICON_WIDTH_LOWEND, ICON_HEIGHT_LOWEND, ICONS_PER_CLASS } from '../randomizer/config';
import { buildSprite } from './sprite-parser';

const ICONS_DIR = path.join(process.cwd(), 'data', 'sprites', 'icons');

/**
 * Get the source icon PNG paths for a skill.
 * Each skill has 2 frames: normal (even index) and pressed (odd index).
 * File naming: {Class}_{N}.bmp (actually PNGs)
 * Original icon indices are based on the skill's original IconCel value.
 */
function getIconPaths(
  originalClass: string,
  originalIconCel: number,
): { normalPath: string; pressedPath: string } {
  // Map charclass to icon folder name
  const classToFolder: Record<string, string> = {
    ama: 'Amazon',
    sor: 'Sorceress',
    nec: 'Necro',
    pal: 'Paladin',
    bar: 'Barbarian',
    dru: 'Druid',
    ass: 'Assassin',
    war: 'Warlock',
  };

  const folder = classToFolder[originalClass];
  if (!folder) {
    throw new Error(`Unknown class for icons: ${originalClass}`);
  }

  const className = folder;

  // IconCel is the base index; normal = IconCel, pressed = IconCel + 1
  const normalIdx = originalIconCel;
  const pressedIdx = originalIconCel + 1;

  return {
    normalPath: path.join(ICONS_DIR, folder, `${className}_${normalIdx}.bmp`),
    pressedPath: path.join(ICONS_DIR, folder, `${className}_${pressedIdx}.bmp`),
  };
}

// Global RGBA buffer cache — icon PNGs are static and never change at runtime.
// Keyed by absolute file path; survives Next.js module reloads within the same process.
const ICON_CACHE_KEY = '__d2r_icon_rgba_cache__';
function getIconRGBACache(): Map<string, Buffer> {
  const g = globalThis as Record<string, unknown>;
  if (!g[ICON_CACHE_KEY]) g[ICON_CACHE_KEY] = new Map<string, Buffer>();
  return g[ICON_CACHE_KEY] as Map<string, Buffer>;
}

/**
 * Load a PNG file (named .bmp) to raw RGBA buffer at the given dimensions,
 * caching the result globally. Cache key includes dimensions so full-res and
 * lowend buffers are stored separately.
 */
async function loadIconToRGBA(filePath: string, width: number, height: number): Promise<Buffer> {
  const cache = getIconRGBACache();
  const cacheKey = `${filePath}:${width}x${height}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey)!;
  try {
    const { data } = await sharp(filePath)
      .resize(width, height)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    cache.set(cacheKey, data);
    return data;
  } catch {
    // Cache transparent fallback so we don't retry the failed read on every request
    console.warn(`Icon not found: ${filePath}, using transparent`);
    const blank = Buffer.alloc(width * height * 4);
    cache.set(cacheKey, blank);
    return blank;
  }
}

/**
 * Build a per-class icon sprite from skill placements.
 * Each skill occupies 2 frames: normal (even index) and pressed (odd index).
 * Output: {prefix}skillicon.sprite
 */
export async function buildClassIconSprite(
  classCode: ClassCode,
  placements: SkillPlacement[],
  skillDescIconCels: Map<string, number>, // skilldesc name → original IconCel
  width: number = ICON_WIDTH,
  height: number = ICON_HEIGHT,
): Promise<Buffer> {
  // Sort placements by skillIndex to ensure correct order
  const sorted = [...placements].sort((a, b) => a.skillIndex - b.skillIndex);

  const frames: Buffer[] = [];

  for (const placement of sorted) {
    const originalClass = placement.skill.charclass;
    const originalIconCel = skillDescIconCels.get(placement.skill.skilldesc) ?? 0;
    const { normalPath, pressedPath } = getIconPaths(originalClass, originalIconCel);
    const normal = await loadIconToRGBA(normalPath, width, height);
    const pressed = await loadIconToRGBA(pressedPath, width, height);
    frames.push(normal, pressed);
  }

  // Pad to 60 frames if needed (shouldn't normally happen)
  while (frames.length < ICONS_PER_CLASS) {
    frames.push(Buffer.alloc(width * height * 4));
  }

  return buildSprite(frames, width, height);
}

/**
 * Build the hireable icon sprite for the hiring panel.
 * Each assigned skill gets 2 consecutive frames (normal at i*2, pressed at i*2+1).
 * Returns the sprite buffer and a map of skillName → HireableIconCel frame index.
 */
export async function buildHireableSprite(
  assignedSkills: Set<string>,
  skillToPlacement: Map<string, SkillPlacement>,
  skillDescIconCels: Map<string, number>,
): Promise<{ sprite: Buffer; hireableIconCels: Map<string, number> }> {
  const hireableIconCels = new Map<string, number>();
  const frames: Buffer[] = [];

  // Sort deterministically for reproducible output
  const sorted = [...assignedSkills].sort();

  for (let i = 0; i < sorted.length; i++) {
    const skillName = sorted[i];
    hireableIconCels.set(skillName, i * 2);
    const placement = skillToPlacement.get(skillName);
    if (!placement) {
      frames.push(Buffer.alloc(ICON_WIDTH * ICON_HEIGHT * 4), Buffer.alloc(ICON_WIDTH * ICON_HEIGHT * 4));
      continue;
    }
    const originalClass = placement.skill.charclass;
    const originalIconCel = skillDescIconCels.get(placement.skill.skilldesc) ?? 0;
    const { normalPath, pressedPath } = getIconPaths(originalClass, originalIconCel);
    const normal = await loadIconToRGBA(normalPath, ICON_WIDTH, ICON_HEIGHT);
    const pressed = await loadIconToRGBA(pressedPath, ICON_WIDTH, ICON_HEIGHT);
    frames.push(normal, pressed);
  }

  return { sprite: buildSprite(frames, ICON_WIDTH, ICON_HEIGHT), hireableIconCels };
}

/**
 * Build all class icon sprites.
 * Returns filename → sprite Buffer map.
 */
export async function buildAllIconSprites(
  placementsByClass: Map<ClassCode, SkillPlacement[]>,
  skillDescIconCels: Map<string, number>,
): Promise<Map<string, Buffer>> {
  const results = new Map<string, Buffer>();

  for (const [classCode, placements] of placementsByClass.entries()) {
    const classDef = CLASS_BY_CODE.get(classCode);
    if (!classDef) continue;
    // Full resolution
    const sprite = await buildClassIconSprite(classCode, placements, skillDescIconCels);
    results.set(`${classDef.spritePrefix}skillicon.sprite`, sprite);
    // Lowend — half resolution, used by D2R on low graphics quality settings
    const lowendSprite = await buildClassIconSprite(classCode, placements, skillDescIconCels, ICON_WIDTH_LOWEND, ICON_HEIGHT_LOWEND);
    results.set(`${classDef.spritePrefix}skillicon.lowend.sprite`, lowendSprite);
  }

  return results;
}
