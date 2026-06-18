import type { MutationContext } from './index';

/**
 * House Always Wins — gambling becomes the only source of weapons and armor.
 *  - Vendors no longer stock weapons or armor (gambling is engine-driven by
 *    the `gamble cost` column, so the gamble window is unaffected).
 *  - Monster/chest drops that would yield a weapon or armor yield gold instead.
 *  - All gold drops are boosted ~+1000% via the `gld,mul=N` treasureclass form.
 */

// D2R gold drops use a fixed-point multiplier in 1024ths: a bare `gld` is
// implicitly mul=1024 (= 100%). So mul=N gives N/1024 of normal gold — e.g. the
// Herald Charm's mul=2048 is 2×. The multiplier must be scaled by 1024 or gold
// rounds to 0 (the original mul=11 was ~1% of normal → every pile showed 0).
const GOLD_MULT_X = 4; // 4× normal gold; calibrate in-game
const MUL_FIXED_POINT = 1024; // D2R mul base: 1024 = 100%
const GOLD_CELL = `"gld,mul=${GOLD_MULT_X * MUL_FIXED_POINT}"`;

// D2 splits gear drops into four generic treasure-class families: body armor
// (armo*) plus three weapon families (weap*, bow*, mele*). Missing bow*/mele*
// let monsters keep dropping bows and melee weapons (which roll sockets).
const GENERIC_GEAR_RE = /^(weap|armo|bow|mele)\d+$/;
const ITEM_COLS = ['Item1', 'Item2', 'Item3', 'Item4', 'Item5', 'Item6', 'Item7', 'Item8', 'Item9', 'Item10'];
const CODE_COLS = ['code', 'normcode', 'ubercode', 'ultracode'];

// Per-vendor stocking columns in armor.txt / weapons.txt. Blanking these removes
// the item from the vendor *buy* tab without touching gambling or transmogrify.
const VENDOR_COL_RE = /^(Charsi|Gheed|Akara|Fara|Lysander|Drognan|Hratli|Alkor|Ormus|Elzix|Asheara|Cain|Halbu|Jamella|Larzuk|Malah|Anya)(Min|Max|MagicMin|MagicMax|MagicLvl)$/;

/** Strip quotes and parameters from a treasureclass Item cell to get the bare code. */
function bareCode(cell: string): string {
  return cell.replace(/^"|"$/g, '').split(',')[0].trim();
}

export function applyHouseAlwaysWins(ctx: MutationContext): void {
  // (a) Collect every weapon/armor base code (normal/exceptional/elite variants).
  const gearCodes = new Set<string>();
  for (const table of [ctx.weapons, ctx.armor]) {
    const { headers, rows } = table;
    const codeIdxs = CODE_COLS.map(c => headers.indexOf(c)).filter(i => i !== -1);
    for (const row of rows) {
      if (!row[0]) continue;
      for (const idx of codeIdxs) {
        const code = row[idx]?.trim();
        if (code) gearCodes.add(code);
      }
    }
  }

  // (b) Convert gear drops → gold, and boost existing gold, in treasureclassex.
  const { headers: th, rows: tr } = ctx.treasureclass;
  const itemIdxs = ITEM_COLS.map(c => th.indexOf(c)).filter(i => i !== -1);
  for (const row of tr) {
    for (const idx of itemIdxs) {
      const cell = row[idx];
      if (!cell) continue;
      const code = bareCode(cell);
      if (GENERIC_GEAR_RE.test(code) || gearCodes.has(code)) {
        // A weapon/armor drop (generic class, specific base, or boss drop) → gold.
        row[idx] = GOLD_CELL;
      } else if (code === 'gld') {
        // Existing plain gold → apply the multiplier. Leave curated gld,mul=… rows alone.
        row[idx] = GOLD_CELL;
      }
    }
  }

  // (c) Remove weapons/armor from every vendor's stock.
  for (const table of [ctx.armor, ctx.weapons]) {
    const { headers, rows } = table;
    const vendorIdxs = headers
      .map((h, i) => (VENDOR_COL_RE.test(h) ? i : -1))
      .filter(i => i !== -1);
    for (const row of rows) {
      if (!row[0]) continue;
      for (const idx of vendorIdxs) row[idx] = '';
    }
  }
}

type Table = { headers: string[]; rows: string[][] };

/** Truthy iff a `gamble cost` cell represents a real (non-zero) cost. */
function hasGambleCost(cell: string | undefined): boolean {
  const v = cell?.trim();
  return !!v && v !== '0';
}

/**
 * Build a comprehensive `gamble.txt` (columns: name, code) so the gamble window
 * offers everything that carries a `gamble cost`. House Always Wins makes
 * gambling the only source of weapons/armor, so anything missing from the pool
 * is otherwise unobtainable. The shipped vanilla pool omits daggers, throwing
 * weapons, javelins/spears, staves/wands/scepters and every class item.
 *
 * Only the normal-tier base of each line is listed (`code === normcode`); the
 * D2R gamble engine upgrades it to the level-appropriate exceptional/elite tier.
 * Reads only — does not mutate the tables.
 */
export function buildGambleTable(weapons: Table, armor: Table, misc: Table): Table {
  const rows: string[][] = [];

  for (const { headers, rows: src } of [weapons, armor]) {
    const ci = headers.indexOf('code');
    const ni = headers.indexOf('name');
    const nci = headers.indexOf('normcode');
    const gi = headers.indexOf('gamble cost');
    if (ci === -1 || nci === -1 || gi === -1) continue;
    for (const row of src) {
      const code = row[ci]?.trim();
      if (!code) continue;
      // Normal-tier base = a row whose normcode points to itself.
      if (code !== row[nci]?.trim()) continue;
      if (!hasGambleCost(row[gi])) continue;
      const name = ni !== -1 ? row[ni]?.trim() || code : code;
      rows.push([name, code]);
    }
  }

  // Jewelry: keep rings/amulets gamblable. Charms (cm1/cm2/cm3/cs2) are excluded
  // — they aren't gear, still drop under House Always Wins, and gambling sunder
  // charms would be off-intent.
  {
    const ci = misc.headers.indexOf('code');
    const ni = misc.headers.indexOf('name');
    const gi = misc.headers.indexOf('gamble cost');
    const JEWELRY = new Set(['rin', 'amu']);
    if (ci !== -1 && gi !== -1) {
      for (const row of misc.rows) {
        const code = row[ci]?.trim();
        if (!code || !JEWELRY.has(code)) continue;
        if (!hasGambleCost(row[gi])) continue;
        const name = ni !== -1 ? row[ni]?.trim() || code : code;
        rows.push([name, code]);
      }
    }
  }

  return { headers: ['name', 'code'], rows };
}
