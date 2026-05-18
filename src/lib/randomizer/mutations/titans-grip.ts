import type { MutationContext } from './index';

const REQ_MULT = 1.5;
const DMG_MULT = 2.0;
const PROC_CHANCE_CAP = 100;

const REQ_COLS = ['reqstr', 'reqdex'];
const DMG_COLS = ['mindam', 'maxdam', '2handmindam', '2handmaxdam'];

const WEAPON_ITYPES = new Set([
  'weap', 'mele', 'miss', 'thro', 'bow', 'xbow',
  'h2h', 'h2h2', 'rod', 'staf', 'wand', 'scep', 'orb',
]);

const CHANCE_PROC_CODES = new Set([
  'hit-skill',     'hit-skill-noc',
  'att-skill',     'att-skill-noc',
  'gethit-skill',  'gethit-skill-noc',
  'kill-skill',    'kill-skill-noc',
  'death-skill',   'death-skill-noc',
  'levelup-skill', 'levelup-skill-noc',
]);

function doubleWeaponProcs(headers: string[], rows: string[][]): void {
  const itypeIdxs = ['itype1','itype2','itype3','itype4','itype5','itype6','itype7']
    .map(c => headers.indexOf(c)).filter(i => i !== -1);
  const levelIdx = headers.indexOf('level');

  for (const row of rows) {
    if (!itypeIdxs.some(i => WEAPON_ITYPES.has(row[i] ?? ''))) continue;
    const affixLevel = levelIdx !== -1 ? (parseInt(row[levelIdx], 10) || 1) : 1;
    const skillLevel = Math.min(20, Math.max(1, Math.floor(affixLevel / 7)));
    for (let slot = 1; slot <= 3; slot++) {
      const codeIdx = headers.indexOf(`mod${slot}code`);
      const minIdx  = headers.indexOf(`mod${slot}min`);
      const maxIdx  = headers.indexOf(`mod${slot}max`);
      if (codeIdx === -1 || minIdx === -1 || maxIdx === -1) continue;
      if (!CHANCE_PROC_CODES.has(row[codeIdx] ?? '')) continue;
      const minVal = parseInt(row[minIdx], 10);
      if (!isNaN(minVal) && minVal > 0) row[minIdx] = String(Math.min(PROC_CHANCE_CAP, minVal * 2));
      row[maxIdx] = String(skillLevel);
    }
  }
}

export function applyTitansGrip(ctx: MutationContext): void {
  const { headers: wh, rows: wr } = ctx.weapons;

  const reqIdxs = REQ_COLS.map(c => wh.indexOf(c)).filter(i => i !== -1);
  const dmgIdxs = DMG_COLS.map(c => wh.indexOf(c)).filter(i => i !== -1);

  for (const row of wr) {
    // Only buff damage on weapons that have a strength or dexterity requirement
    const hasReq = reqIdxs.some(idx => parseInt(row[idx], 10) > 0);

    for (const idx of reqIdxs) {
      const val = parseInt(row[idx], 10);
      if (!isNaN(val) && val > 0) row[idx] = String(Math.ceil(val * REQ_MULT));
    }
    if (hasReq) {
      for (const idx of dmgIdxs) {
        const val = parseInt(row[idx], 10);
        if (!isNaN(val) && val > 0) row[idx] = String(Math.round(val * DMG_MULT));
      }
    }
  }

  doubleWeaponProcs(ctx.magicprefix.headers, ctx.magicprefix.rows);
  doubleWeaponProcs(ctx.magicsuffix.headers, ctx.magicsuffix.rows);
}
