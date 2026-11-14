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
// v60 casts Rabies/Hunger with A1 instead of S3 on non-Druid shapeshift hosts
// (the engine only locks the S3 action for Druids).
// v61 ships controllerskillsettings.json remapped to the shuffled skills.txt rows,
// so gamepad skill behavior follows each skill instead of its old row.
// v62 keeps mercenary skills out of Race Mode's Prayer filler (locked on filler
// classes instead) and re-rolls vanilla item procs whose row became an aura/passive.
// v63 renames the skill tabs and their item strings from "Random N" to "Skill Tree N"
// (strings only: no RNG, same trees).
// v64 flattens hand-installed zips: the zip root is the mod folder (seedN.mpq/, the
// shortcut, a new README.txt), downloaded as seedN.zip. Archipelago zips keep the
// seedN/ prefix their client expects. Same files and bytes otherwise.
// v65 updates the game tables to D2R 3.4.95032 (skills, monstats, cubemain,
// treasureclassex, uniqueitems) and strings (skills, item-names, item-modifiers),
// and stamps DataVersionBuild 95032. No RNG change:
// the only loader-visible difference (EType on Summon Tainted and Sigil Death)
// is on aura skills that no filter picks, so layouts stay the same.
// v66 switches monster shuffle to v5 selection (melee donors allowed in ranged
// slots, fixed 10-family rosters, stronger reuse penalty); challenges 16–17 keep v4.
// v67 ships setitems.txt, sets.txt and runes.txt in every mod with their skill lines
// remapped to the shuffled skills.txt rows (vanilla names some by row index, so Leaf,
// Black and several set procs granted whatever skill moved into that row). No main-RNG
// change: trees are the same; re-rolls of aura/passive procs use their own stream.
// v68 adds December 2026's Krampusnacht lineup (Dead Reckoning, Krampus Is Coming, Cold
// Snap) for challenge 18. Other seeds and challenges are unchanged; bumped so a challenge
// 18 zip requested early through weekOverride is not served from the cache.
export const PIPELINE_VERSION = 68;
