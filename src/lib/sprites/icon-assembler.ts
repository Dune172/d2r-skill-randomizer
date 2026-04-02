import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
sharp.concurrency(1); // Limit libvips threads to prevent process limit exhaustion on shared hosting
sharp.cache(false);   // Disable libvips operation cache so threads are released between requests
import { ClassCode, SkillPlacement } from '../randomizer/types';
import { CLASS_BY_CODE, ICON_WIDTH, ICON_HEIGHT, ICONS_PER_CLASS } from '../randomizer/config';
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
 * Load a PNG file (named .bmp) to raw RGBA buffer, caching the result globally.
 */
async function loadIconToRGBA(filePath: string): Promise<Buffer> {
  const cache = getIconRGBACache();
  if (cache.has(filePath)) return cache.get(filePath)!;
  try {
    const { data } = await sharp(filePath)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    cache.set(filePath, data);
    return data;
  } catch {
    // Cache transparent fallback so we don't retry the failed read on every request
    console.warn(`Icon not found: ${filePath}, using transparent`);
    const blank = Buffer.alloc(ICON_WIDTH * ICON_HEIGHT * 4);
    cache.set(filePath, blank);
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
): Promise<Buffer> {
  // Sort placements by skillIndex to ensure correct order
  const sorted = [...placements].sort((a, b) => a.skillIndex - b.skillIndex);

  const frames: Buffer[] = [];

  for (const placement of sorted) {
    const originalClass = placement.skill.charclass;
    const originalIconCel = skillDescIconCels.get(placement.skill.skilldesc) ?? 0;
    const { normalPath, pressedPath } = getIconPaths(originalClass, originalIconCel);
    const normal = await loadIconToRGBA(normalPath);
    const pressed = await loadIconToRGBA(pressedPath);
    frames.push(normal, pressed);
  }

  // Pad to 60 frames if needed (shouldn't normally happen)
  while (frames.length < ICONS_PER_CLASS) {
    frames.push(Buffer.alloc(ICON_WIDTH * ICON_HEIGHT * 4));
  }

  return buildSprite(frames, ICON_WIDTH, ICON_HEIGHT);
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
    const normal = await loadIconToRGBA(normalPath);
    const pressed = await loadIconToRGBA(pressedPath);
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
    const sprite = await buildClassIconSprite(classCode, placements, skillDescIconCels);
    results.set(`${classDef.spritePrefix}skillicon.sprite`, sprite);
  }

  return results;
}
