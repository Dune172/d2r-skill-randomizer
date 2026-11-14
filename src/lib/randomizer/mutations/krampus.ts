import type { MutationContext } from './index';
import { balanceEnemy } from '../enemy-balance';

/**
 * Krampus Is Coming — Krampus takes over one superunique in Acts I, II, III and V.
 *
 * New spawn points need map edits (superuniques are placed by level presets via
 * hcIdx), so Krampus replaces existing, non-quest superuniques in place: same spot,
 * same hcIdx, new monster. Act IV has only quest and seal bosses, so it has none.
 *
 * THE MONSTER. Each Krampus is a new monstats row, built the way the enemy shuffle
 * builds its clones (balanceEnemy): the goat-demon donor (goatman1–5, the variant
 * nearest in level) keeps its coefficients, AI and animations, and takes the
 * replaced superunique's own monster's Normal level, so monlvl scales it to the
 * spot it guards. Nightmare/Hell superuniques use area level anyway. On top:
 *  - twice the life (min/max HP in every difficulty);
 *  - the replaced monster's experience, so XP stays tuned to the area;
 *  - his minions are a matching balanced goat-man row rather than more Krampuses.
 * MonStatsEx still points at the donor's monstats2 row, as enemy-shuffle clones do,
 * so collision, modes and SD graphics are the goatman's.
 *
 * THE LOOK. The new rows start mapped to the donor's HD token. src/lib/krampus-assets.ts
 * then points the Krampus rows at the d2rr_krampus unit (an enlarged goatman with a
 * gift stack on its back, data/krampus/) when that unit matches the game build.
 *
 * THE SUPERUNIQUE. Name → "Krampus" (D2RR_Krampus, added to the monster strings),
 * fixed modifiers Cold Enchanted (frost nova on death), Cursed and Extra Strong,
 * and the treasure class of that act's boss in each difficulty (non-quest drop),
 * Terror Zone columns included where vanilla has them.
 */

export const KRAMPUS_NAME_KEY = 'D2RR_Krampus';
const KRAMPUS_MODS = ['18', '7', '5']; // cold (Cold Enchanted), curse (Cursed), strong (Extra Strong)
const HP_MULT = 2;
const DONOR_FAMILY = 'goatman1';

interface Spawn { superunique: string; act: number; tc: [string, string, string] }

export const KRAMPUS_SPAWNS: readonly Spawn[] = [
  { superunique: 'Bishibosh',   act: 1, tc: ['Andariel', 'Andariel (N)', 'Andariel (H)'] },
  { superunique: 'Beetleburst', act: 2, tc: ['Duriel - Base', 'Duriel (N) - Base', 'Duriel (H) - Base'] },
  { superunique: 'Stormtree',   act: 3, tc: ['Mephisto', 'Mephisto (N)', 'Mephisto (H)'] },
  { superunique: 'Frozenstein', act: 5, tc: ['Baal', 'Baal (N)', 'Baal (H)'] },
];

export const krampusId = (act: number) => `d2rr_krampus${act}`;
export const krampusMinionId = (act: number) => `d2rr_krampusgoat${act}`;

const TC_COLS: readonly (readonly [string, string])[] = [
  ['TC', 'TC Desecrated'], ['TC(N)', 'TC(N) Desecrated'], ['TC(H)', 'TC(H) Desecrated'],
];
const HP_COLS = ['minHP', 'maxHP', 'MinHP(N)', 'MaxHP(N)', 'MinHP(H)', 'MaxHP(H)'];
const EXP_COLS = ['Exp', 'Exp(N)', 'Exp(H)'];

type Monster = Record<string, string>;
const n = (v: string | undefined) => Number(v) || 0;

export function applyKrampus(ctx: MutationContext): void {
  const graphics = ctx.monsterGraphics;
  if (!graphics) throw new Error('Krampus: monster graphics map is required');
  const { headers: mh, rows: mr } = ctx.monstats;
  const { headers: sh, rows: sr } = ctx.superuniques;
  for (const c of ['Id', '*hcIdx', 'BaseId', 'Level', 'NameStr', 'minion1', 'minion2', ...HP_COLS, ...EXP_COLS]) {
    if (!mh.includes(c)) throw new Error(`Krampus: monstats.txt has no ${c} column`);
  }
  for (const c of ['Superunique', 'Name', 'Class', 'Mod1', 'Mod2', 'Mod3', ...TC_COLS.flat()]) {
    if (!sh.includes(c)) throw new Error(`Krampus: superuniques.txt has no ${c} column`);
  }
  const tcNames = new Set(ctx.treasureclass.rows.map(r => r[0]));

  const record = (row: string[]): Monster => Object.fromEntries(mh.map((h, i) => [h, row[i] ?? '']));
  const byId = new Map(mr.map(r => [r[0], record(r)]));
  if (byId.has(krampusId(1))) throw new Error('Krampus: applied twice');
  const donors = mr.map(record).filter(m => m.BaseId === DONOR_FAMILY && m.Id.startsWith('goatman'));
  if (!donors.length) throw new Error('Krampus: no goatman rows in monstats.txt');
  let nextIndex = Math.max(...mr.map(r => n(r[mh.indexOf('*hcIdx')]))) + 1;

  const append = (m: Monster) => {
    m['*hcIdx'] = String(nextIndex++);
    mr.push(mh.map(h => m[h] ?? ''));
  };

  for (const spawn of KRAMPUS_SPAWNS) {
    const su = sr.find(r => r[sh.indexOf('Superunique')] === spawn.superunique);
    if (!su) throw new Error(`Krampus: superunique ${spawn.superunique} not found`);
    const dest = byId.get(su[sh.indexOf('Class')]);
    if (!dest) throw new Error(`Krampus: ${spawn.superunique}'s class ${su[sh.indexOf('Class')]} not found`);
    const donor = [...donors].sort((a, b) =>
      Math.abs(n(a.Level) - n(dest.Level)) - Math.abs(n(b.Level) - n(dest.Level)) || (a.Id < b.Id ? -1 : 1))[0];

    const minion = balanceEnemy(donor, dest);
    minion.Id = krampusMinionId(spawn.act);
    minion.NextInClass = '';
    append(minion);
    graphics[minion.Id] = graphics[donor.Id] ?? donor.Id;

    const krampus = balanceEnemy(donor, dest);
    krampus.Id = krampusId(spawn.act);
    krampus.NameStr = KRAMPUS_NAME_KEY;
    krampus.NextInClass = '';
    krampus.minion1 = minion.Id;
    krampus.minion2 = '';
    for (const c of HP_COLS) krampus[c] = String(Math.round(n(krampus[c]) * HP_MULT));
    for (const c of EXP_COLS) krampus[c] = dest[c];
    append(krampus);
    graphics[krampus.Id] = graphics[donor.Id] ?? donor.Id;

    su[sh.indexOf('Class')] = krampus.Id;
    su[sh.indexOf('Name')] = KRAMPUS_NAME_KEY;
    ['Mod1', 'Mod2', 'Mod3'].forEach((c, i) => { su[sh.indexOf(c)] = KRAMPUS_MODS[i]; });
    TC_COLS.forEach(([col, desecrated], d) => {
      const tc = spawn.tc[d];
      if (!tcNames.has(tc)) throw new Error(`Krampus: treasure class ${tc} not found`);
      su[sh.indexOf(col)] = tc;
      // Terror Zones: vanilla fills only some of these. Keep the boss haul there too.
      if (su[sh.indexOf(desecrated)]) {
        const zoned = `${tc} Desecrated`;
        su[sh.indexOf(desecrated)] = tcNames.has(zoned) ? zoned : tc;
      }
    });
  }
}

/** Monster ids whose HD token src/lib/krampus-assets.ts swaps to the Krampus unit. */
export const KRAMPUS_IDS: readonly string[] = KRAMPUS_SPAWNS.map(s => krampusId(s.act));
