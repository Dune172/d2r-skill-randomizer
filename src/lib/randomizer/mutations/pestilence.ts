import type { MutationContext } from './index';

const POISON_TYPE  = 'pois';
const POISON_MODE  = 'A1';
const POISON_PCT   = '100';
const POISON_DUR   = '150';
const POISON_SCALE = 0.25;
const POISON_MIN_FALLBACK = 10;
const POISON_MAX_FALLBACK = 30;

const EL_SLOTS = [
  {
    type: 'El1Type', mode: 'El1Mode',
    pct: 'El1Pct', pctN: 'El1Pct(N)', pctH: 'El1Pct(H)',
    min: 'El1MinD', minN: 'El1MinD(N)', minH: 'El1MinD(H)',
    max: 'El1MaxD', maxN: 'El1MaxD(N)', maxH: 'El1MaxD(H)',
    dur: 'El1Dur',  durN: 'El1Dur(N)',  durH: 'El1Dur(H)',
  },
  {
    type: 'El2Type', mode: 'El2Mode',
    pct: 'El2Pct', pctN: 'El2Pct(N)', pctH: 'El2Pct(H)',
    min: 'El2MinD', minN: 'El2MinD(N)', minH: 'El2MinD(H)',
    max: 'El2MaxD', maxN: 'El2MaxD(N)', maxH: 'El2MaxD(H)',
    dur: 'El2Dur',  durN: 'El2Dur(N)',  durH: 'El2Dur(H)',
  },
  {
    type: 'El3Type', mode: 'El3Mode',
    pct: 'El3Pct', pctN: 'El3Pct(N)', pctH: 'El3Pct(H)',
    min: 'El3MinD', minN: 'El3MinD(N)', minH: 'El3MinD(H)',
    max: 'El3MaxD', maxN: 'El3MaxD(N)', maxH: 'El3MaxD(H)',
    dur: 'El3Dur',  durN: 'El3Dur(N)',  durH: 'El3Dur(H)',
  },
] as const;

function scaledPoison(base: number): number {
  return Math.max(1, Math.floor(base * POISON_SCALE));
}

export function applyPestilence(ctx: MutationContext): void {
  const { headers: mh, rows: mr } = ctx.monstats;

  // Pre-resolve all column indices
  const slots = EL_SLOTS.map(s => ({
    type:  mh.indexOf(s.type),
    mode:  mh.indexOf(s.mode),
    pct:   mh.indexOf(s.pct),  pctN: mh.indexOf(s.pctN),  pctH: mh.indexOf(s.pctH),
    min:   mh.indexOf(s.min),  minN: mh.indexOf(s.minN),  minH: mh.indexOf(s.minH),
    max:   mh.indexOf(s.max),  maxN: mh.indexOf(s.maxN),  maxH: mh.indexOf(s.maxH),
    dur:   mh.indexOf(s.dur),  durN: mh.indexOf(s.durN),  durH: mh.indexOf(s.durH),
  })).filter(s => s.type !== -1);

  const a1MinIdx   = mh.indexOf('A1MinD');
  const a1MaxIdx   = mh.indexOf('A1MaxD');
  const a1MinNIdx  = mh.indexOf('A1MinD(N)');
  const a1MaxNIdx  = mh.indexOf('A1MaxD(N)');
  const a1MinHIdx  = mh.indexOf('A1MinD(H)');
  const a1MaxHIdx  = mh.indexOf('A1MaxD(H)');

  for (const row of mr) {
    if (!row[0]) continue;

    const empty = slots.find(s => !row[s.type]);
    if (!empty) continue;

    // Compute per-difficulty poison damage from physical damage
    const baseMin  = parseInt(row[a1MinIdx]  || '0', 10) || 0;
    const baseMax  = parseInt(row[a1MaxIdx]  || '0', 10) || 0;
    const nmMin    = parseInt(row[a1MinNIdx] || '0', 10) || 0;
    const nmMax    = parseInt(row[a1MaxNIdx] || '0', 10) || 0;
    const hellMin  = parseInt(row[a1MinHIdx] || '0', 10) || 0;
    const hellMax  = parseInt(row[a1MaxHIdx] || '0', 10) || 0;

    const poisMinBase  = baseMin  > 0 ? scaledPoison(baseMin)  : POISON_MIN_FALLBACK;
    const poisMaxBase  = baseMax  > 0 ? scaledPoison(baseMax)  : POISON_MAX_FALLBACK;
    const poisMinNM    = nmMin    > 0 ? scaledPoison(nmMin)    : poisMinBase;
    const poisMaxNM    = nmMax    > 0 ? scaledPoison(nmMax)    : poisMaxBase;
    const poisMinHell  = hellMin  > 0 ? scaledPoison(hellMin)  : poisMinNM;
    const poisMaxHell  = hellMax  > 0 ? scaledPoison(hellMax)  : poisMaxNM;

    row[empty.type] = POISON_TYPE;
    if (empty.mode !== -1) row[empty.mode] = POISON_MODE;

    if (empty.pct  !== -1) row[empty.pct]  = POISON_PCT;
    if (empty.min  !== -1) row[empty.min]  = String(poisMinBase);
    if (empty.max  !== -1) row[empty.max]  = String(poisMaxBase);
    if (empty.dur  !== -1) row[empty.dur]  = POISON_DUR;

    if (empty.pctN  !== -1) row[empty.pctN]  = POISON_PCT;
    if (empty.minN  !== -1) row[empty.minN]  = String(poisMinNM);
    if (empty.maxN  !== -1) row[empty.maxN]  = String(poisMaxNM);
    if (empty.durN  !== -1) row[empty.durN]  = POISON_DUR;

    if (empty.pctH  !== -1) row[empty.pctH]  = POISON_PCT;
    if (empty.minH  !== -1) row[empty.minH]  = String(poisMinHell);
    if (empty.maxH  !== -1) row[empty.maxH]  = String(poisMaxHell);
    if (empty.durH  !== -1) row[empty.durH]  = POISON_DUR;
  }

  // Remove antidote potions from treasure classes
  const { headers: th, rows: tr } = ctx.treasureclass;
  const tcNameIdx = th.indexOf('Treasure Class');
  const itemIdxs: number[] = [];
  const probIdxs: number[] = [];
  for (let i = 1; i <= 10; i++) {
    const ii = th.indexOf(`Item${i}`);
    const pi = th.indexOf(`Prob${i}`);
    if (ii !== -1) itemIdxs.push(ii);
    if (pi !== -1) probIdxs.push(pi);
  }
  const noDropIdx = th.indexOf('NoDrop');

  for (const row of tr) {
    if (tcNameIdx !== -1 && row[tcNameIdx]?.toLowerCase().includes('antidote')) {
      for (const i of itemIdxs) row[i] = '';
      for (const p of probIdxs) row[p] = '';
      continue;
    }
    for (let i = 0; i < itemIdxs.length; i++) {
      const item = row[itemIdxs[i]]?.toLowerCase() ?? '';
      if (item.includes('apot') || item === 'apc' || item === 'aps') {
        const removed = parseInt(row[probIdxs[i]] || '0', 10);
        row[itemIdxs[i]] = '';
        row[probIdxs[i]] = '';
        if (noDropIdx !== -1 && removed > 0) {
          const nd = parseInt(row[noDropIdx] || '0', 10);
          row[noDropIdx] = String(nd + removed);
        }
      }
    }
  }
}
