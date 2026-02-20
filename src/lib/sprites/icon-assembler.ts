import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
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

/**
 * Load a PNG file (named .bmp) to raw RGBA buffer
 */
async function loadIconToRGBA(filePath: string): Promise<Buffer> {
  try {
    const { data } = await sharp(filePath)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return data;
  } catch {
    // Return transparent frame if icon not found
    console.warn(`Icon not found: ${filePath}, using transparent`);
    return Buffer.alloc(ICON_WIDTH * ICON_HEIGHT * 4);
  }
}

/**
 * Build a per-class icon sprite from skill placements.
 * Each class gets 60 frames (30 skills × 2 frames each).
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

    const normalFrame = await loadIconToRGBA(normalPath);
    const pressedFrame = await loadIconToRGBA(pressedPath);

    frames.push(normalFrame);
    frames.push(pressedFrame);
  }

  // Pad to 60 frames if needed (shouldn't normally happen)
  while (frames.length < ICONS_PER_CLASS) {
    frames.push(Buffer.alloc(ICON_WIDTH * ICON_HEIGHT * 4));
  }

  return buildSprite(frames, ICON_WIDTH, ICON_HEIGHT);
}

/**
 * Build all class icon sprites.
 * Returns map of filename → Buffer
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
