import type { MutationContext } from './index';

const LIFE_MANA_MULT = 0.5; // reduce by 50%
const REGEN_MULT = 3;

const LIFE_COLS  = ['hpadd', 'LifePerLevel'];
const MANA_COLS  = ['ManaPerLevel'];
const REGEN_COLS = ['ManaRegen'];

// Unique ring given to all classes at the start of Hollow Shell week.
// regen = replenish life (50/sec), regen-mana = regenerate mana (+50%).
// lvl=1 makes it the only eligible unique ring at character creation (all
// vanilla unique rings require lvl 15+), so quality=4 will always pick it.
const RING_INDEX = 'Hollow Locket';
const RING_CODE  = 'rin';

export function applyHollowShell(ctx: MutationContext): void {
  // ── 1. Reduce max life and mana, triple mana regen ──────────────────────
  const { headers: ch, rows: cr } = ctx.charstats;

  const lifeIdxs  = LIFE_COLS.map(c => ch.indexOf(c)).filter(i => i !== -1);
  const manaIdxs  = MANA_COLS.map(c => ch.indexOf(c)).filter(i => i !== -1);
  const regenIdxs = REGEN_COLS.map(c => ch.indexOf(c)).filter(i => i !== -1);

  for (const row of cr) {
    for (const idx of [...lifeIdxs, ...manaIdxs]) {
      const val = parseInt(row[idx], 10);
      if (!isNaN(val) && val > 0) row[idx] = String(Math.round(val * LIFE_MANA_MULT));
    }
    for (const idx of regenIdxs) {
      const val = parseInt(row[idx], 10);
      if (!isNaN(val) && val > 0) row[idx] = String(Math.round(val * REGEN_MULT));
    }
  }

  // ── 2. Add "Hollow Locket" unique ring to uniqueitems.txt ────────────────
  const { headers: uh, rows: ur } = ctx.uniqueitems;
  if (uh.length > 0) {
    const set = (row: string[], col: string, val: string) => {
      const i = uh.indexOf(col);
      if (i !== -1) row[i] = val;
    };

    const newRing = new Array(uh.length).fill('');
    set(newRing, 'index',    RING_INDEX);
    set(newRing, 'version',  '0');
    set(newRing, 'disabled', '0');
    set(newRing, 'spawnable','1');
    set(newRing, 'code',     RING_CODE);
    set(newRing, 'lvl',      '1');
    set(newRing, 'lvl req',  '1');
    set(newRing, 'rarity',   '1');
    set(newRing, 'prop1',    'regen');       // replenish life
    set(newRing, 'min1',     '50');
    set(newRing, 'max1',     '50');
    set(newRing, 'prop2',    'regen-mana');  // regenerate mana
    set(newRing, 'min2',     '50');
    set(newRing, 'max2',     '50');
    ur.push(newRing);
  }

  // ── 3. Give "Hollow Locket" as a starting ring to every class ───────────
  // quality=4 forces unique quality; lvl=1 makes Hollow Locket the only
  // eligible unique ring at character creation.
  for (const row of cr) {
    if (!row[0]) continue; // skip blank/expansion rows
    for (let n = 1; n <= 10; n++) {
      const itemCol = ch.indexOf(`item${n}`);
      if (itemCol === -1) continue;
      if (row[itemCol] === '' || row[itemCol] === '0') {
        row[itemCol] = RING_CODE;
        const locCol = ch.indexOf(`item${n}loc`);
        const cntCol = ch.indexOf(`item${n}count`);
        const qCol   = ch.indexOf(`item${n}quality`);
        if (locCol !== -1) row[locCol] = 'rarm'; // right ring slot
        if (cntCol !== -1) row[cntCol] = '1';
        if (qCol   !== -1) row[qCol]   = '4';    // unique quality
        break;
      }
    }
  }
}
