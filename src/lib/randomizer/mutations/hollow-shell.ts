import type { MutationContext } from './index';

const LIFE_MANA_MULT = 0.5; // reduce by 50%
const REGEN_MULT = 3;

const LIFE_COLS = ['hpadd', 'LifePerLevel'];
const MANA_COLS = ['ManaPerLevel'];
const REGEN_COLS = ['ManaRegen'];

export function applyHollowShell(ctx: MutationContext): void {
  const { headers: ch, rows: cr } = ctx.charstats;

  const lifeIdxs = LIFE_COLS.map(c => ch.indexOf(c)).filter(i => i !== -1);
  const manaIdxs = MANA_COLS.map(c => ch.indexOf(c)).filter(i => i !== -1);
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
}
