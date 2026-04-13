import type { MutationContext } from './index';
import { TC_COL, ACT_RE, BOSS_ACTS } from '../players-scaler';

const POISON_TYPE = 'pois';
const POISON_PCT  = '100';
const POISON_DUR  = '200'; // 8 seconds at 25fps

const POISON_BY_ACT: Record<number, { min: number; max: number }> = {
  1: { min: 45,  max: 90  },
  2: { min: 75,  max: 150 },
  3: { min: 105, max: 210 },
  4: { min: 135, max: 270 },
  5: { min: 165, max: 330 },
};
const POISON_FALLBACK = { min: 75, max: 150 }; // unknown/non-act monsters

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
// damage that is NOT already covered by an existing El slot, we write one
// poison El slot so the elemental effect fires on that attack.
const ATTACK_MODES = [
  { mode: 'A1', minCol: 'A1MinD' },
  { mode: 'A2', minCol: 'A2MinD' },
  { mode: 'S1', minCol: 'S1MinD' },
] as const;

type ResolvedSlot = {
  type: number; mode: number;
  pct: number; pctN: number; pctH: number;
  min: number; minN: number; minH: number;
  max: number; maxN: number; maxH: number;
  dur: number; durN: number; durH: number;
};

function writePoison(row: string[], slot: ResolvedSlot, modeStr: string, dmg: { min: number; max: number }): void {
  row[slot.type] = POISON_TYPE;
  if (slot.mode !== -1) row[slot.mode] = modeStr;

  if (slot.pct  !== -1) row[slot.pct]  = POISON_PCT;
  if (slot.min  !== -1) row[slot.min]  = String(dmg.min);
  if (slot.max  !== -1) row[slot.max]  = String(dmg.max);
  if (slot.dur  !== -1) row[slot.dur]  = POISON_DUR;

  if (slot.pctN !== -1) row[slot.pctN] = POISON_PCT;
  if (slot.minN !== -1) row[slot.minN] = String(dmg.min);
  if (slot.maxN !== -1) row[slot.maxN] = String(dmg.max);
  if (slot.durN !== -1) row[slot.durN] = POISON_DUR;

  if (slot.pctH !== -1) row[slot.pctH] = POISON_PCT;
  if (slot.minH !== -1) row[slot.minH] = String(dmg.min);
  if (slot.maxH !== -1) row[slot.maxH] = String(dmg.max);
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

  // Pre-resolve attack mode activity columns (min damage only — used to detect
  // whether a mode is actually used by this monster)
  const attackModes = ATTACK_MODES.map(a => ({
    mode:   a.mode,
    minIdx: mh.indexOf(a.minCol),
  }));

  const tcIdx = mh.indexOf(TC_COL);

  for (const row of mr) {
    if (!row[0]) continue;

    // Collect free El slots (where Type is unset)
    const freeSlots = slots.filter(s => !row[s.type]);
    if (freeSlots.length === 0) continue;

    // Collect attack modes that have non-zero base damage
    const activeModes = attackModes.filter(a =>
      a.minIdx !== -1 && parseInt(row[a.minIdx] || '0', 10) > 0
    );
    if (activeModes.length === 0) continue; // non-combat monster, skip

    // Build set of attack modes already covered by existing (occupied) El slots.
    // D2 only fires the first El slot per attack mode, so writing a second slot
    // for the same mode (e.g. El2=A1/pois when El1=A1/fire) has no effect.
    const coveredModes = new Set(
      slots
        .filter(s => row[s.type])                      // slot has an elemental type
        .map(s => (s.mode !== -1 ? row[s.mode] : ''))  // read its Mode column
        .filter(Boolean)
    );

    // Only poison modes NOT already covered by an existing El slot
    const uncoveredModes = activeModes.filter(a => !coveredModes.has(a.mode));
    if (uncoveredModes.length === 0) continue;

    // Determine act for damage scaling
    const tc = tcIdx !== -1 ? (row[tcIdx] ?? '') : '';
    const m = tc.match(ACT_RE);
    const act = m ? parseInt(m[1]) : (BOSS_ACTS[row[0]] ?? 0);
    const dmg = POISON_BY_ACT[act] ?? POISON_FALLBACK;

    // One poison El slot per uncovered active attack mode
    let slotIdx = 0;
    for (const atk of uncoveredModes) {
      if (slotIdx >= freeSlots.length) break;
      writePoison(row, freeSlots[slotIdx], atk.mode, dmg);
      slotIdx++;
    }
  }

  // Increase antidote potion purchase price 10× in misc.txt
  const { headers: misch, rows: miscr } = ctx.misc;
  const miscCodeIdx = misch.indexOf('code');
  const miscCostIdx = misch.indexOf('cost');
  if (miscCodeIdx !== -1 && miscCostIdx !== -1) {
    for (const row of miscr) {
      if (row[miscCodeIdx] === 'yps') {
        const cost = parseInt(row[miscCostIdx], 10);
        if (!isNaN(cost) && cost > 0) row[miscCostIdx] = String(cost * 10);
        break;
      }
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
