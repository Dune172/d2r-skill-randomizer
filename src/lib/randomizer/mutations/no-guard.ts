import type { MutationContext } from './index';
import { TC_COL, monsterAct } from '../players-scaler';

/**
 * No Guard — nobody has defense. Not you, not them.
 *
 * Every piece of armor gives zero defense, no skill anywhere in the game grants
 * defense either (the seven defense-granting skills are pulled from the shuffle
 * pool entirely — see NO_GUARD_EXCLUDED_SKILLS — and their tree slots are filled
 * by substitutes, the same machinery "Remove Teleport" uses), and every enemy's
 * AC is zeroed as well. Resistances and block are the only mitigation left.
 *
 * Monster AC was originally left at vanilla, on the theory that zeroing it reads
 * as a buff: with defense 0 the to-hit roll collapses to the level term, so a
 * character at or above the monster's level hits at the 95% cap. Play testing
 * says the opposite — a run with no armor defense AND vanilla monster AC is just
 * losing, and missing on top of it makes the week read as punishment rather than
 * as a rule. Zeroing both sides is the rule the name promises, and the player
 * still eats every hit that lands, which is where the difficulty actually lives.
 *
 * Note the level term survives: 2×alvl/(alvl+dlvl) still applies, so an
 * underlevelled character misses plenty even against AC 0.
 *
 * Skills are excluded rather than nerfed because a shuffled tree makes "did you
 * happen to roll a defense skill" pure luck: nerfing leaves the asymmetry in
 * place, removing them from the pool applies the rule to everyone equally.
 */

const AC_COLS = ['minac', 'maxac'];

// Monster AC per difficulty. monlvl.txt scales these by a percentage, so a base
// of 0 stays 0 in Nightmare and Hell; unique/champion AC bonuses are multipliers
// on the same base and collapse the same way.
const MONSTER_AC_COLS = ['AC', 'AC(N)', 'AC(H)'];

// The excluded-skill list lives in a pure-data module so the browser can read it.
export { NO_GUARD_EXCLUDED_SKILLS } from '../../mutations/no-guard-skills';

export function applyNoGuard(ctx: MutationContext): void {
  const { headers: ah, rows: ar } = ctx.armor;
  const acIdxs = AC_COLS.map(c => ah.indexOf(c)).filter(i => i !== -1);

  for (const row of ar) {
    if (!row[0]) continue;
    for (const idx of acIdxs) {
      const val = parseInt(row[idx], 10);
      if (isNaN(val) || val === 0) continue;
      row[idx] = '0';
    }
  }

  const { headers: mh, rows: mr } = ctx.monstats;
  const tcIdx = mh.indexOf(TC_COL);
  const monAcIdxs = MONSTER_AC_COLS.map(c => mh.indexOf(c)).filter(i => i !== -1);

  for (const row of mr) {
    const id = row[0];
    if (!id) continue;

    // Skip player summons, hirelings, traps, and map objects — same guard as
    // players-scaler. The player's own minions keep their defense.
    const tc = tcIdx !== -1 ? (row[tcIdx] ?? '') : '';
    if (monsterAct(id, tc, ctx.monsterDestinationActs) === null) continue;

    for (const idx of monAcIdxs) {
      const val = parseInt(row[idx], 10);
      if (isNaN(val) || val === 0) continue;
      row[idx] = '0';
    }
  }
}
