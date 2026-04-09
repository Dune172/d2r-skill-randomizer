import type { MutationContext } from './index';

// Poison type string as used in monstats El*Type columns
const POISON_TYPE = 'Poison';
// Poison values applied to all monsters (Normal difficulty base)
const POISON_PCT = '100';
const POISON_MIN = '10';
const POISON_MAX = '30';
const POISON_DUR = '150'; // frames (~6 seconds at 25fps)

const EL_SLOTS = [
  { type: 'El1Type', mode: 'El1Mode', pct: 'El1Pct', min: 'El1MinD', max: 'El1MaxD', dur: 'El1Dur' },
  { type: 'El2Type', mode: 'El2Mode', pct: 'El2Pct', min: 'El2MinD', max: 'El2MaxD', dur: 'El2Dur' },
  { type: 'El3Type', mode: 'El3Mode', pct: 'El3Pct', min: 'El3MinD', max: 'El3MaxD', dur: 'El3Dur' },
] as const;

export function applyPestilence(ctx: MutationContext): void {
  const { headers: mh, rows: mr } = ctx.monstats;

  // Pre-resolve column indices for all El slots
  const slots = EL_SLOTS.map(s => ({
    type: mh.indexOf(s.type),
    mode: mh.indexOf(s.mode),
    pct:  mh.indexOf(s.pct),
    min:  mh.indexOf(s.min),
    max:  mh.indexOf(s.max),
    dur:  mh.indexOf(s.dur),
  })).filter(s => s.type !== -1);

  for (const row of mr) {
    if (!row[0]) continue;
    // Find an empty El slot (no type set) and assign poison there
    const empty = slots.find(s => !row[s.type]);
    if (!empty) continue;
    row[empty.type] = POISON_TYPE;
    if (empty.mode !== -1) row[empty.mode] = '0';
    if (empty.pct  !== -1) row[empty.pct]  = POISON_PCT;
    if (empty.min  !== -1) row[empty.min]  = POISON_MIN;
    if (empty.max  !== -1) row[empty.max]  = POISON_MAX;
    if (empty.dur  !== -1) row[empty.dur]  = POISON_DUR;
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
      // Zero out item entries
      for (const i of itemIdxs) row[i] = '';
      for (const p of probIdxs) row[p] = '';
      continue;
    }
    // Also zero out any individual item slot that references antidote potions
    for (let i = 0; i < itemIdxs.length; i++) {
      const item = row[itemIdxs[i]]?.toLowerCase() ?? '';
      if (item.includes('apot') || item === 'apc' || item === 'aps') {
        const removed = parseInt(row[probIdxs[i]] || '0', 10);
        row[itemIdxs[i]] = '';
        row[probIdxs[i]] = '';
        // Redistribute removed weight to NoDrop
        if (noDropIdx !== -1 && removed > 0) {
          const nd = parseInt(row[noDropIdx] || '0', 10);
          row[noDropIdx] = String(nd + removed);
        }
      }
    }
  }
}
