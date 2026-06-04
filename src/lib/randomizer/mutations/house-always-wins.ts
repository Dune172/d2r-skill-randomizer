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

const GENERIC_GEAR_RE = /^(weap|armo)\d+$/;
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
