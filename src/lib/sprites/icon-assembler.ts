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
 * Build a per-class icon sprite from skill placements, optionally appending
 * extra frames for skills assigned to hirelings of this class's native type.
 *
 * Normal frames: 60 (30 skills × 2 frames), at positions 0–59.
 * Extra frames:  2 per hireling skill, at positions 60, 62, 64, ... (sorted).
 *
 * Output: {prefix}skillicon.sprite
 */
export async function buildClassIconSprite(
  classCode: ClassCode,
  placements: SkillPlacement[],
  skillDescIconCels: Map<string, number>, // skilldesc name → original IconCel
  extraFrames?: Array<{ pos: number; normal: Buffer; pressed: Buffer }>,
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

  // Append extra hireling skill frames in ascending position order.
  // Positions are globally assigned (60, 62, ...) so they are consistent
  // across all sprites that reference the same IconCel value.
  if (extraFrames && extraFrames.length > 0) {
    const sorted_extras = [...extraFrames].sort((a, b) => a.pos - b.pos);
    for (const ef of sorted_extras) {
      frames.push(ef.normal);
      frames.push(ef.pressed);
    }
  }

  return buildSprite(frames, ICON_WIDTH, ICON_HEIGHT);
}

/**
 * Build all class icon sprites, with extra frames injected for hireling skills.
 *
 * For each skill S assigned to a hireling with native class N:
 *   - Extra frames are added to S's targetClass sprite (for the player's skill tree)
 *   - Extra frames are added to N's native class sprite (for the hiring panel)
 *   - S's IconCel is updated to the extra frame position (returned in extraIconCels)
 *
 * Returns:
 *   sprites      — filename → sprite Buffer (as before)
 *   extraIconCels — skill name → new IconCel position (≥ 60) for skills that were
 *                   injected; caller must apply these to skilldesc.txt rows.
 */
export async function buildAllIconSprites(
  placementsByClass: Map<ClassCode, SkillPlacement[]>,
  skillDescIconCels: Map<string, number>,
  hirelingSkillsByNativeClass?: Map<string, Set<string>>,
  skillToPlacement?: Map<string, SkillPlacement>,
): Promise<{ sprites: Map<string, Buffer>; extraIconCels: Map<string, number> }> {
  const extraIconCels = new Map<string, number>();

  // Per-class extra frames to inject: classCode → [{pos, normal, pressed}]
  const classExtraFrames = new Map<string, Array<{ pos: number; normal: Buffer; pressed: Buffer }>>();

  if (hirelingSkillsByNativeClass && skillToPlacement && hirelingSkillsByNativeClass.size > 0) {
    // Collect all unique hireling skill names across all native classes
    const allHirelingSkills = new Set<string>();
    for (const skillSet of hirelingSkillsByNativeClass.values()) {
      for (const name of skillSet) allHirelingSkills.add(name);
    }

    // Sort deterministically; assign extra frame positions starting at 60
    const sortedSkills = [...allHirelingSkills].sort();
    for (let i = 0; i < sortedSkills.length; i++) {
      extraIconCels.set(sortedSkills[i], 60 + i * 2);
    }

    // Load icon for each skill and register it in the relevant class sprites
    for (const skillName of sortedSkills) {
      const placement = skillToPlacement.get(skillName);
      if (!placement) {
        console.warn(`icon-assembler: no placement found for hireling skill "${skillName}", skipping`);
        continue;
      }

      const originalClass = placement.skill.charclass;
      const originalIconCel = skillDescIconCels.get(placement.skill.skilldesc) ?? 0;
      const { normalPath, pressedPath } = getIconPaths(originalClass, originalIconCel);
      const normalBuf = await loadIconToRGBA(normalPath);
      const pressedBuf = await loadIconToRGBA(pressedPath);

      const extraPos = extraIconCels.get(skillName)!;
      const frameEntry = { pos: extraPos, normal: normalBuf, pressed: pressedBuf };

      // Add to skill's own class sprite (for the player's skill tree display)
      const targetClass = placement.targetClass;
      if (!classExtraFrames.has(targetClass)) classExtraFrames.set(targetClass, []);
      classExtraFrames.get(targetClass)!.push(frameEntry);

      // Add to each native class sprite that uses this skill (for the hiring panel)
      for (const [nativeClass, skillSet] of hirelingSkillsByNativeClass) {
        if (skillSet.has(skillName) && nativeClass !== targetClass) {
          if (!classExtraFrames.has(nativeClass)) classExtraFrames.set(nativeClass, []);
          classExtraFrames.get(nativeClass)!.push(frameEntry);
        }
      }
    }
  }

  const results = new Map<string, Buffer>();

  for (const [classCode, placements] of placementsByClass.entries()) {
    const classDef = CLASS_BY_CODE.get(classCode);
    if (!classDef) continue;

    const extras = classExtraFrames.get(classCode);
    const sprite = await buildClassIconSprite(classCode, placements, skillDescIconCels, extras);
    results.set(`${classDef.spritePrefix}skillicon.sprite`, sprite);
  }

  return { sprites: results, extraIconCels };
}
