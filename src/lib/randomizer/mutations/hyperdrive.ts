import type { MutationContext } from './index';
import { TC_COL, ACT_RE, BOSS_ACTS } from '../players-scaler';

const SPEED_MULT = 1.5;
const PLAYER_SPEED_MULT = 1.3;
const EXTRA_FAST = 'Extra Fast';
const MON_SPEED_COLS = ['Velocity', 'Run'];
const PLAYER_SPEED_COLS = ['WalkVelocity', 'RunVelocity'];
const MOD_COLS = ['Mod1', 'Mod2', 'Mod3'];

export function applyHyperdrive(ctx: MutationContext): void {
  // Monster speed
  const { headers: mh, rows: mr } = ctx.monstats;
  const tcIdx = mh.indexOf(TC_COL);
  const mSpeedIdxs = MON_SPEED_COLS.map(c => mh.indexOf(c)).filter(i => i !== -1);
  for (const row of mr) {
    const id = row[0];
    if (!id) continue;
    const tc = tcIdx !== -1 ? (row[tcIdx] ?? '') : '';
    if (!ACT_RE.test(tc) && !(id in BOSS_ACTS)) continue;
    for (const idx of mSpeedIdxs) {
      const val = parseInt(row[idx], 10);
      if (!isNaN(val) && val > 0) row[idx] = String(Math.round(val * SPEED_MULT));
    }
  }

  // Player speed
  const { headers: ch, rows: cr } = ctx.charstats;
  const pSpeedIdxs = PLAYER_SPEED_COLS.map(c => ch.indexOf(c)).filter(i => i !== -1);
  for (const row of cr) {
    for (const idx of pSpeedIdxs) {
      const val = parseInt(row[idx], 10);
      if (!isNaN(val) && val > 0) row[idx] = String(Math.round(val * PLAYER_SPEED_MULT));
    }
  }

  // SuperUniques: add Extra Fast to first empty Mod slot
  const { headers: sh, rows: sr } = ctx.superuniques;
  const modIdxs = MOD_COLS.map(c => sh.indexOf(c)).filter(i => i !== -1);
  for (const row of sr) {
    // Skip if already has Extra Fast
    if (modIdxs.some(i => row[i] === EXTRA_FAST)) continue;
    const emptyIdx = modIdxs.find(i => !row[i]);
    if (emptyIdx !== undefined) row[emptyIdx] = EXTRA_FAST;
  }
}
