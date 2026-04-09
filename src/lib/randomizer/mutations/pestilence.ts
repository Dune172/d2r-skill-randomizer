import type { MutationContext } from './index';

const POISON_TYPE  = 'pois';
const POISON_PCT   = '100';
const POISON_DUR   = '150';
const POISON_SCALE = 0.25;

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

// Attack modes to check, in priority order. For each mode with non-zero base
// damage, we write one poison El slot using that mode string so the elemental
// effect fires on the attacks the monster actually uses.
const ATTACK_MODES = [
  { mode: 'A1', min: 'A1MinD', max: 'A1MaxD', minN: 'A1MinD(N)', maxN: 'A1MaxD(N)', minH: 'A1MinD(H)', maxH: 'A1MaxD(H)' },
  { mode: 'A2', min: 'A2MinD', max: 'A2MaxD', minN: 'A2MinD(N)', maxN: 'A2MaxD(N)', minH: 'A2MinD(H)', maxH: 'A2MaxD(H)' },
  { mode: 'S1', min: 'S1MinD', max: 'S1MaxD', minN: 'S1MinD(N)', maxN: 'S1MaxD(N)', minH: 'S1MinD(H)', maxH: 'S1MaxD(H)' },
] as const;

type ResolvedSlot = {
  type: number; mode: number;
  pct: number; pctN: number; pctH: number;
  min: number; minN: number; minH: number;
  max: number; maxN: number; maxH: number;
  dur: number; durN: number; durH: number;
};

function scaledPoison(base: number): number {
  return Math.max(1, Math.floor(base * POISON_SCALE));
}

function writePoison(
  row: string[],
  slot: ResolvedSlot,
  modeStr: string,
  poisMinBase: number, poisMaxBase: number,
  poisMinNM: number,   poisMaxNM: number,
  poisMinHell: number, poisMaxHell: number,
): void {
  row[slot.type] = POISON_TYPE;
  if (slot.mode !== -1) row[slot.mode] = modeStr;

  if (slot.pct  !== -1) row[slot.pct]  = POISON_PCT;
  if (slot.min  !== -1) row[slot.min]  = String(poisMinBase);
  if (slot.max  !== -1) row[slot.max]  = String(poisMaxBase);
  if (slot.dur  !== -1) row[slot.dur]  = POISON_DUR;

  if (slot.pctN !== -1) row[slot.pctN] = POISON_PCT;
  if (slot.minN !== -1) row[slot.minN] = String(poisMinNM);
  if (slot.maxN !== -1) row[slot.maxN] = String(poisMaxNM);
  if (slot.durN !== -1) row[slot.durN] = POISON_DUR;

  if (slot.pctH !== -1) row[slot.pctH] = POISON_PCT;
  if (slot.minH !== -1) row[slot.minH] = String(poisMinHell);
  if (slot.maxH !== -1) row[slot.maxH] = String(poisMaxHell);
  if (slot.durH !== -1) row[slot.durH] = POISON_DUR;
}

export function applyPestilence(ctx: MutationContext): void {
  const { headers: mh, rows: mr } = ctx.monstats;

  // Pre-resolve El slot column indices
  const slots: ResolvedSlot[] = EL_SLOTS.map(s => ({
    type:  mh.indexOf(s.type),
    mode:  mh.indexOf(s.mode),
    pct:   mh.indexOf(s.pct),  pctN: mh.indexOf(s.pctN),  pctH: mh.indexOf(s.pctH),
    min:   mh.indexOf(s.min),  minN: mh.indexOf(s.minN),  minH: mh.indexOf(s.minH),
    max:   mh.indexOf(s.max),  maxN: mh.indexOf(s.maxN),  maxH: mh.indexOf(s.maxH),
    dur:   mh.indexOf(s.dur),  durN: mh.indexOf(s.durN),  durH: mh.indexOf(s.durH),
  })).filter(s => s.type !== -1);

  // Pre-resolve attack mode column indices
  const attackModes = ATTACK_MODES.map(a => ({
    mode: a.mode,
    min:  mh.indexOf(a.min),  max:  mh.indexOf(a.max),
    minN: mh.indexOf(a.minN), maxN: mh.indexOf(a.maxN),
    minH: mh.indexOf(a.minH), maxH: mh.indexOf(a.maxH),
  }));

  for (const row of mr) {
    if (!row[0]) continue;

    // Collect free El slots (where Type is unset)
    const freeSlots = slots.filter(s => !row[s.type]);
    if (freeSlots.length === 0) continue;

    // Collect attack modes that have non-zero base damage
    const activeModes = attackModes.filter(a =>
      a.min !== -1 && parseInt(row[a.min] || '0', 10) > 0
    );
    if (activeModes.length === 0) continue; // non-combat monster, skip

    // One poison El slot per active attack mode (A1, then A2, then S1)
    let slotIdx = 0;
    for (const atk of activeModes) {
      if (slotIdx >= freeSlots.length) break;

      const baseMin = parseInt(row[atk.min]  || '0', 10);
      const baseMax = atk.max  !== -1 ? parseInt(row[atk.max]  || '0', 10) : baseMin;
      const nmMin   = atk.minN !== -1 ? parseInt(row[atk.minN] || '0', 10) : 0;
      const nmMax   = atk.maxN !== -1 ? parseInt(row[atk.maxN] || '0', 10) : 0;
      const hellMin = atk.minH !== -1 ? parseInt(row[atk.minH] || '0', 10) : 0;
      const hellMax = atk.maxH !== -1 ? parseInt(row[atk.maxH] || '0', 10) : 0;

      const poisMinBase = scaledPoison(baseMin);
      const poisMaxBase = scaledPoison(baseMax);
      const poisMinNM   = nmMin   > 0 ? scaledPoison(nmMin)   : poisMinBase;
      const poisMaxNM   = nmMax   > 0 ? scaledPoison(nmMax)   : poisMaxBase;
      const poisMinHell = hellMin > 0 ? scaledPoison(hellMin) : poisMinNM;
      const poisMaxHell = hellMax > 0 ? scaledPoison(hellMax) : poisMaxNM;

      writePoison(
        row, freeSlots[slotIdx], atk.mode,
        poisMinBase, poisMaxBase,
        poisMinNM,   poisMaxNM,
        poisMinHell, poisMaxHell,
      );
      slotIdx++;
    }
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
