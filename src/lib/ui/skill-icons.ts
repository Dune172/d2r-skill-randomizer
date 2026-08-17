/**
 * Web skill-icon assets — client-safe (no node imports).
 *
 * Tiles are pre-built into public/skill-icons/<version>/ by
 * scripts/build-skill-icon-assets.mjs. They are served as plain <img> with
 * baked-in dimensions, deliberately NOT through next/image: /_next/image is
 * on-demand sharp work, and ~240 optimizer requests on one spoiler expand
 * would contend with ZIP generation on a 2-vCPU box.
 */

/** Path segment that lets next.config.ts serve these `immutable`.
 *  Bump together with ASSET_VERSION in scripts/build-skill-icon-assets.mjs. */
export const SKILL_ICON_VERSION = 'v1';

/** Pixel size of a generated tile. Feeds <img width/height> so the intrinsic
 *  size can't drift from the generator's TILE constant. */
export const SKILL_ICON_TILE = 96;

/**
 * @param classCode the skill's original class (`iconClass` from /api/preview)
 * @param cel the vanilla IconCel — always even, 0..58
 */
export function skillIconSrc(classCode: string, cel: number): string {
  return `/skill-icons/${SKILL_ICON_VERSION}/${classCode}_${cel}.webp`;
}
