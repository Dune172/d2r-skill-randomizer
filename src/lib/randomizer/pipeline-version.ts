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
 *
 * Note: this value is ONLY used as a cache-key prefix (src/lib/zip-cache.ts) —
 * it is never fed into the RNG. Bumping it therefore invalidates cached ZIPs
 * WITHOUT changing what a given seed generates. A bug fix that changes output
 * bytes but consumes no RNG (v0.256's Arcane Surge mana rounding) still needs a
 * bump, or players keep being served the cached broken ZIP; their skill layouts
 * are unaffected.
 */
// v56 changes Molasses to 30% slower movement, preserving its damage settings.
// v57 adds the Autumn Towns HD overlay to mods generated in October/November.
// v58 switches monster shuffle to v4 selection (per-act rosters, weighted picks);
// challenges before 16 keep v3 selection and regenerate identically.
// v59 scales Forgotten Arts synergies by source-spell rarity (20–50% of native)
// and adds Necromancer/Warlock summons and masteries (Bone Armor removed).
export const PIPELINE_VERSION = 59;
