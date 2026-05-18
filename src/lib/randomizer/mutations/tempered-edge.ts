import type { MutationContext } from './index';
import { TC_COL, ACT_RE, BOSS_ACTS } from '../players-scaler';

const ELEM_RES_BONUS = 30;
const PHYS_RES_PENALTY = 40;
const RES_CAP = 99;
const RES_FLOOR = -100;

const ELEM_RES_COLS = [
  'ResCo', 'ResCo(N)', 'ResCo(H)',
  'ResFi', 'ResFi(N)', 'ResFi(H)',
  'ResLi', 'ResLi(N)', 'ResLi(H)',
  'ResPo', 'ResPo(N)', 'ResPo(H)',
];

const PHYS_RES_COLS = ['ResDm', 'ResDm(N)', 'ResDm(H)'];

export function applyTemperedEdge(ctx: MutationContext): void {
  const { headers: mh, rows: mr } = ctx.monstats;
  const elemIdxs = ELEM_RES_COLS.map(c => mh.indexOf(c)).filter(i => i !== -1);
  const physIdxs = PHYS_RES_COLS.map(c => mh.indexOf(c)).filter(i => i !== -1);
  const tcIdx = mh.indexOf(TC_COL);

  for (const row of mr) {
    const id = row[0];
    if (!id) continue;
    const tc = tcIdx !== -1 ? (row[tcIdx] ?? '') : '';
    if (!ACT_RE.test(tc) && !(id in BOSS_ACTS)) continue;

    for (const idx of elemIdxs) {
      const val = parseInt(row[idx], 10);
      const base = isNaN(val) ? 0 : val;
      row[idx] = String(Math.min(RES_CAP, base + ELEM_RES_BONUS));
    }

    for (const idx of physIdxs) {
      const val = parseInt(row[idx], 10);
      const base = isNaN(val) ? 0 : val;
      row[idx] = String(Math.max(RES_FLOOR, base - PHYS_RES_PENALTY));
    }
  }
}
