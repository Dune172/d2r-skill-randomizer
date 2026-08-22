import type { MutationContext } from './index';

/**
 * No Guard — armor is a stat tax, not protection.
 *
 * Every piece of armor gives zero defense, and no skill anywhere in the game
 * grants defense either: the seven defense-granting skills are pulled from the
 * shuffle pool entirely (see NO_GUARD_EXCLUDED_SKILLS) and their tree slots are
 * filled by substitutes, the same machinery "Remove Teleport" uses. Resistances
 * and block are untouched and become the only mitigation in the game.
 *
 * Monster defense is deliberately LEFT ALONE. Zeroing it would mean the player
 * always hits at the 95% cap, which is a large buff to attack-rating-starved
 * melee builds — the mutation would read as easier than vanilla for much of the
 * roster. The interesting half is the player losing defense, not monsters losing it.
 *
 * Skills are excluded rather than nerfed because a shuffled tree makes "did you
 * happen to roll a defense skill" pure luck: nerfing leaves the asymmetry in
 * place, removing them from the pool applies the rule to everyone equally.
 */

const AC_COLS = ['minac', 'maxac'];

/**
 * Skills whose primary effect is granting defense (AC). Excluded from placement
 * when No Guard is active.
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

export function applyNoGuard(ctx: MutationContext): void {
  const { headers: ah, rows: ar } = ctx.armor;
  const acIdxs = AC_COLS.map(c => ah.indexOf(c)).filter(i => i !== -1);
  if (acIdxs.length === 0) return;

  for (const row of ar) {
    if (!row[0]) continue;
    for (const idx of acIdxs) {
      const val = parseInt(row[idx], 10);
      if (isNaN(val) || val === 0) continue;
      row[idx] = '0';
    }
  }
}
