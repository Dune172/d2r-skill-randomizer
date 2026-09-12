type Monster = Record<string, string>;
const DIFFICULTIES = ['', '(N)', '(H)'];
const ATTACKS = ['A1', 'A2', 'S1'];
const ELEMENTS = new Set(['fire', 'ltng', 'cold', 'mag', 'rand', 'pois']);
const n = (v: string | undefined) => Number(v) || 0;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const integer = (v: number) => String(Math.max(0, Math.round(v)));

/** Keep the donor's monstats coefficients and let monlvl scale them once.
 * Normal uses the original local monster's level. The expansion engine uses
 * area levels in Nightmare/Hell for these ordinary, ratio-scaled clones.
 * Only fields that level does not balance receive the existing safeguards.
 */
export function balanceEnemy(source: Monster, destination: Monster): Monster {
  const clone = { ...source };
  for (const key of Object.keys(destination)) {
    if (key.startsWith('TreasureClass') || ['Level', 'Level(N)', 'Level(H)', 'Rarity', 'sparsePopulate', 'neverCount', 'TCQuestId', 'TCQuestCP'].includes(key)) clone[key] = destination[key];
  }
  // Only donor self-parties are supported; redirect them to the clone later.
  for (const key of ['minion1', 'minion2', 'SetBoss', 'BossXfer']) clone[key] = '';
  const early = n(destination.Level) < 6;
  // Crit and group size are shared across difficulties in monstats.
  clone.Crit = integer(Math.min(n(source.Crit), early ? 5 : 10));

  // Health, physical/elemental damage, defense, attack rating and XP retain
  // their original coefficients. Do not fill unused attacks or add a second
  // source/destination percentage: the game already scales these by level.
  for (const diff of DIFFICULTIES) {
    for (const i of [1, 2, 3]) {
      const type = source[`El${i}Type`];
      if (!ELEMENTS.has(type) || !ATTACKS.includes(source[`El${i}Mode`]) || !n(source[`El${i}Pct${diff}`])) {
        clone[`El${i}MinD${diff}`] = '0';
        clone[`El${i}MaxD${diff}`] = '0';
      }
      clone[`El${i}Pct${diff}`] = integer(clamp(n(source[`El${i}Pct${diff}`]), 0, 100));
      // Level scales elemental magnitude, but not poison/cold/stun duration.
      clone[`El${i}Dur${diff}`] = integer(Math.min(n(source[`El${i}Dur${diff}`]), type === 'stun' ? 10 : 25));
      if (['pois', 'rand'].includes(type)) clone[`El${i}Dur${diff}`] = integer(clamp(n(source[`El${i}Dur${diff}`]) || 25, 1, 25));
      if (!diff && n(destination.Level) < 12 && ['stun', 'cold'].includes(type)) {
        clone[`El${i}Dur${diff}`] = '0';
        if (type === 'stun') clone[`El${i}Pct${diff}`] = '0';
      }
    }
    if (!diff) {
      // Protect Normal progression. Nightmare/Hell keep the donor's original
      // resistances and immunities, without importing destination immunities.
      for (const res of ['ResDm', 'ResMa', 'ResFi', 'ResLi', 'ResCo', 'ResPo']) {
        clone[res] = String(Math.round(clamp(n(source[res]), -100, n(destination.Level) < 12 ? 25 : 50)));
      }
    }
  }
  // Keep donor packs without the old toughness-based resizing. Retain the
  // established maximum of four in starting areas and eight elsewhere.
  const cap = early ? 4 : 8;
  clone.MinGrp = integer(clamp(n(source.MinGrp) || 1, 1, cap));
  clone.MaxGrp = integer(clamp(n(source.MaxGrp) || 1, n(clone.MinGrp), cap));
  if (source.minion1 === source.Id && !source.minion2) {
    clone.PartyMin = integer(clamp(n(source.PartyMin), 0, cap));
    clone.PartyMax = integer(clamp(n(source.PartyMax), n(clone.PartyMin), cap));
  } else {
    clone.PartyMin = ''; clone.PartyMax = '';
  }
  return clone;
}
