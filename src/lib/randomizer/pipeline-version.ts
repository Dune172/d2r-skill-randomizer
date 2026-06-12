/**
 * PIPELINE_VERSION — single source of truth for the deterministic randomization
 * pipeline's identity. Prepended to every zip-cache key so that (a) cached ZIPs
 * stay valid across server restarts within the same version, and (b) cache
 * auto-invalidates when the developer bumps this number.
 *
 * Bump this when ANY change would cause the same seed + same options to
 * produce a different ZIP. Checklist:
 *
 *   • Logic edits under src/lib/randomizer/** (placement, synergies, prereqs,
 *     hireling, tree shuffle, RNG consumption order)
 *   • Content edits to data/json/skills.json, data/json/skilldesc.json,
 *     data/skill_tree_grid.csv, or data/txt/skills.txt column order/rows
 *   • Order or content changes to HARDCODED_CLASS_SKILLS or SKILL_CLASS_EXCLUSIONS
 *     (src/lib/randomizer/skill-placer.ts)
 *   • Order changes to CLASS_DEFS or CHARCLASS_TO_CODE
 *     (src/lib/randomizer/config.ts)
 *   • Changes to the sort key in placeSkills()
 *   • Any new mutation that modifies skills.txt / charstats.txt in a way that
 *     changes the output ZIP for the same seed
 *
 * Do NOT bump for: UI/CSS changes, changelog entries, README edits, comment-only
 * edits, build/deploy config, or anything that doesn't touch the bytes inside
 * the generated ZIP.
 */
export const PIPELINE_VERSION = 30;
