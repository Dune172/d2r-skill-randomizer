import type { MutationContext } from './index';

const RES_BONUS = 25;
const RES_CAP = 99;

const RES_COLS = [
  'ResFi', 'ResFi(N)', 'ResFi(H)',
  'ResLi', 'ResLi(N)', 'ResLi(H)',
  'ResCo', 'ResCo(N)', 'ResCo(H)',
  'ResMa', 'ResMa(N)', 'ResMa(H)',
];

export function applyWarded(ctx: MutationContext): void {
  const { headers: mh, rows: mr } = ctx.monstats;
  const cols = RES_COLS.map(c => mh.indexOf(c)).filter(i => i !== -1);
  if (cols.length === 0) return;

  for (const row of mr) {
    if (!row[0]) continue;
    for (const idx of cols) {
      const val = parseInt(row[idx], 10);
      const base = isNaN(val) ? 0 : val;
      row[idx] = String(Math.min(RES_CAP, base + RES_BONUS));
    }
  }
}
