/**
 * Skills whose primary effect is granting defense (AC). Excluded from placement
 * when No Guard is active. Pure data so the Class Builder can check a build
 * against it in the browser; re-exported by randomizer/mutations/no-guard.ts.
 *
 * Names are the internal skills.txt identifiers, which do not always match the
 * in-game display name — verify against data/txt/skills.txt before adding any.
 *
 * Deliberately NOT listed:
 *   • Bone Armor, Cyclone Armor, Energy Shield — absorb a damage pool rather
 *     than granting AC, so they do not undermine the premise.
 *   • Fade (resists), Weapon Block / Blade Shield (block, damage) — same reason.
 *   • Wearbear — its defense bonus is incidental to being a shapeshift FORM
 *     ANCHOR. COPACEMENT_REQUIRES co-locates Maul / Fire Claws / Hunger with
 *     whichever class hosts it, and FORM_GATED_PINS vacates Shock Wave when it
 *     does not land on Druid. Dropping it would cascade through the whole
 *     shapeshift kit for a marginal amount of defense.
 */
export const NO_GUARD_EXCLUDED_SKILLS: ReadonlySet<string> = new Set([
  // Sorceress
  'Frozen Armor',
  'Shiver Armor',
  'Chilling Armor',
  // Paladin
  'Defiance',
  'Holy Shield',
  // Barbarian
  'Shout',
  'Iron Skin',
]);
