import type { MutationContext } from './index';
import { TC_COL, ACT_RE, BOSS_ACTS } from '../players-scaler';

const POISON_TYPE = 'pois';
const POISON_PCT  = '100';
const POISON_DUR  = '200'; // 8 seconds at 25fps

// +10 min / +15 max per act, starting from 45/90 in Act 1.
const POISON_BY_ACT: Record<number, { min: number; max: number }> = {
  1: { min: 45, max: 90  },
  2: { min: 55, max: 105 },
  3: { min: 65, max: 120 },
  4: { min: 75, max: 135 },
  5: { min: 85, max: 150 },
};
const POISON_FALLBACK = { min: 55, max: 105 }; // unknown/non-act monsters (Act 2 equiv.)

// Bosses and miniboss-like combat monsters that Pestilence should also poison
// but that are intentionally NOT in BOSS_ACTS (which is scoped to /players
// HP/damage scaling where Uber bosses, Cow Level, and Diabloclone are excluded).
// Value is the act number used for poison damage scaling.
const PESTILENCE_EXTRA_ACTS: Record<string, number> = {
  // Diablo Walks
  diabloclone: 4,
  // Maggot Lair larvae (Act 2)
  maggotbaby1: 2, maggotbaby2: 2, maggotbaby3: 2,
  maggotbaby4: 2, maggotbaby5: 2, maggotbaby6: 2,
  // Cow Level
  hellbovine: 5, cowking: 5,
  // Uber Tristram bosses
  ubermephisto: 5, uberdiablo: 5, uberizual: 5,
  uberandariel: 5, uberduriel: 5, uberbaal: 5,
  // Ancient Barbarian statues and their transformed forms (Arreat Summit)
  colossal1: 5, colossal2: 5, colossal3: 5,
  colbarbwhirl: 5, colbarbthrow: 5, colbarbfrenzy: 5,
  // Higher-tier skeleton mage / vampire / wraith / willowisp variants used in
  // late-game areas that carry no TreasureClass entry
  skmage_fire7: 5, skmage_ltng7: 5, skmage_cold6: 5, skmage_pois7: 5,
  vampire9: 5, wraith9: 5, willowisp8: 5,
};

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

// Attack modes to check, in priority order. For each mode the monster
// actively uses (via a non-zero MinD column OR a filled Skill*/Sk*mode slot)
// that is NOT already covered by an existing El slot, we write one poison
// El slot so the elemental effect fires on that attack.
// A1/A2/S1 have dedicated MinD damage columns in monstats.txt. S2/S3/S4/SC
// do not — monsters using those modes do so via their Skill*/Sk*mode slots.
const ATTACK_MODES: readonly { mode: string; minCol: string | null }[] = [
  { mode: 'A1', minCol: 'A1MinD' },
  { mode: 'A2', minCol: 'A2MinD' },
  { mode: 'S1', minCol: 'S1MinD' },
  { mode: 'S2', minCol: null },
  { mode: 'S3', minCol: null },
  { mode: 'S4', minCol: null },
  { mode: 'SC', minCol: null },
];

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
  // whether A1/A2/S1 are actually used by this monster). S2/S3/S4/SC have no
  // MinD column and are detected via Sk*mode instead.
  const attackModes = ATTACK_MODES.map(a => ({
    mode:   a.mode,
    minIdx: a.minCol ? mh.indexOf(a.minCol) : -1,
  }));

  // Pre-resolve Skill*/Sk*mode columns — used to detect modes like S2/S3/S4/SC
  // that monsters invoke via their skill slots (imps, vampires, willowisps, etc.)
  const skModeIdxs = ['Sk1mode','Sk2mode','Sk3mode','Sk4mode','Sk5mode','Sk6mode','Sk7mode','Sk8mode']
    .map(c => mh.indexOf(c));
  const skillIdxs = ['Skill1','Skill2','Skill3','Skill4','Skill5','Skill6','Skill7','Skill8']
    .map(c => mh.indexOf(c));

  const tcIdx = mh.indexOf(TC_COL);

  for (const row of mr) {
    const id = row[0];
    if (!id) continue;

    // Skip player summons, traps, and map objects
    const tc = tcIdx !== -1 ? (row[tcIdx] ?? '') : '';
    if (!ACT_RE.test(tc) && !(id in BOSS_ACTS) && !(id in PESTILENCE_EXTRA_ACTS)) continue;

    // Determine act for damage scaling (needed for the broken-poison fix below)
    const actMatch = tc.match(ACT_RE);
    const rowAct = actMatch
      ? parseInt(actMatch[1])
      : (BOSS_ACTS[id] ?? PESTILENCE_EXTRA_ACTS[id] ?? 0);
    const rowDmg = POISON_BY_ACT[rowAct] ?? POISON_FALLBACK;

    // Base-game data quirk: ~30 monsters (fetishblow, foulcrow, sandleaper,
    // maggotbaby, vilemother, etc.) have El slots with Type=pois and a valid
    // Mode, but Pct/MinD/MaxD/Dur are all blank — so they do zero poison
    // damage in vanilla despite being tagged for poison. Fill the damage
    // values in so they actually deal poison.
    for (const s of slots) {
      if (
        row[s.type] === POISON_TYPE &&
        s.mode !== -1 && row[s.mode] &&  // has a real attack mode
        s.min !== -1 && !row[s.min]      // but no damage values
      ) {
        writePoison(row, s, row[s.mode], rowDmg);
      }
    }

    // Collect free El slots (where Type is unset)
    const freeSlots = slots.filter(s => !row[s.type]);
    if (freeSlots.length === 0) continue;

    // Build set of spell modes the monster invokes through its skill slots
    // (e.g. ImpBolt in Sk2mode=S2, Chain Lightning in Sk1mode=SC)
    const skillUsedModes = new Set<string>();
    for (let i = 0; i < skModeIdxs.length; i++) {
      const modeIdx = skModeIdxs[i];
      const skillIdx = skillIdxs[i];
      if (modeIdx === -1 || skillIdx === -1) continue;
      const mode = row[modeIdx];
      const skillName = row[skillIdx];
      if (mode && skillName) skillUsedModes.add(mode);
    }

    // A mode is "active" if either its MinD column is > 0 (A1/A2/S1) OR it
    // appears in one of the monster's Skill*/Sk*mode pairs (S2/S3/S4/SC).
    const activeModes = attackModes.filter(a => {
      if (a.minIdx !== -1 && parseInt(row[a.minIdx] || '0', 10) > 0) return true;
      return skillUsedModes.has(a.mode);
    });
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

    // One poison El slot per uncovered active attack mode
    let slotIdx = 0;
    for (const atk of uncoveredModes) {
      if (slotIdx >= freeSlots.length) break;
      writePoison(row, freeSlots[slotIdx], atk.mode, rowDmg);
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
