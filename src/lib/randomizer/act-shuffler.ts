import type { SeededRNG } from './seed';

const ACT_HP_MULT:  Record<number, number> = { 1: 1.0, 2: 2.5,  3: 5.0,  4: 8.0,  5: 13.0 };
const ACT_DMG_MULT: Record<number, number> = { 1: 1.0, 2: 2.0,  3: 3.5,  4: 5.5,  5: 8.0  };
const ACT_XP_MULT:  Record<number, number> = { 1: 1.0, 2: 3.0,  3: 7.0,  4: 12.0, 5: 20.0 };
const ACT_AC_MULT:  Record<number, number> = { 1: 1.0, 2: 1.8,  3: 3.0,  4: 4.5,  5: 7.0  };
const ACT_AVG_LVL:  Record<number, number> = { 1: 8,   2: 18,   3: 24,   4: 28,   5: 36   };

const HP_COLS  = ['minHP', 'maxHP', 'MinHP(N)', 'MaxHP(N)', 'MinHP(H)', 'MaxHP(H)'];
const XP_COLS  = ['Exp', 'Exp(N)', 'Exp(H)'];
const DMG_COLS = [
  'A1MinD', 'A1MaxD', 'A2MinD', 'A2MaxD', 'S1MinD', 'S1MaxD',
  'A1MinD(N)', 'A1MaxD(N)', 'A2MinD(N)', 'A2MaxD(N)', 'S1MinD(N)', 'S1MaxD(N)',
  'A1MinD(H)', 'A1MaxD(H)', 'A2MinD(H)', 'A2MaxD(H)', 'S1MinD(H)', 'S1MaxD(H)',
];
const AR_COLS = [
  'A1TH', 'A2TH', 'S1TH',
  'A1TH(N)', 'A2TH(N)', 'S1TH(N)',
  'A1TH(H)', 'A2TH(H)', 'S1TH(H)',
];
const AC_COLS  = ['AC', 'AC(N)', 'AC(H)'];
const LVL_COLS = ['Level', 'Level(N)', 'Level(H)'];
const TC_COLS  = [
  'TreasureClass', 'TreasureClassChamp', 'TreasureClassUnique', 'TreasureClassQuest',
  'TreasureClassDesecrated', 'TreasureClassDesecratedChamp', 'TreasureClassDesecratedUnique',
  'TreasureClassHerald',
  'TreasureClass(N)', 'TreasureClassChamp(N)', 'TreasureClassUnique(N)', 'TreasureClassQuest(N)',
  'TreasureClassDesecrated(N)', 'TreasureClassDesecratedChamp(N)', 'TreasureClassDesecratedUnique(N)',
  'TreasureClassHerald(N)',
  'TreasureClass(H)', 'TreasureClassChamp(H)', 'TreasureClassUnique(H)', 'TreasureClassQuest(H)',
  'TreasureClassDesecrated(H)', 'TreasureClassDesecratedChamp(H)', 'TreasureClassDesecratedUnique(H)',
  'TreasureClassHerald(H)',
];

const ACT_RE = /^(Act )(\d)/;

// Boss monsters whose TreasureClass doesn't contain "Act N" but belong to a specific act.
// For these: scale stats only, leave TC strings unchanged.
const BOSS_ACTS: Record<string, number> = {
  // Act 1
  andariel: 1, bloodraven: 1, griswold: 1, smith: 1,
  quillrat1: 1, quillrat2: 1, quillrat3: 1, quillrat4: 1, quillrat5: 1,
  quillrat6: 1, quillrat7: 1, quillrat8: 1,
  // Act 2
  radament: 2, duriel: 2, summoner: 2, flyingscimitar: 2,
  swarm1: 2, swarm2: 2, swarm3: 2, swarm4: 2, swarm5: 2,
  vulture1: 2, vulture2: 2, vulture3: 2, vulture4: 2, vulture5: 2,
  maggotegg1: 2, maggotegg2: 2, maggotegg3: 2, maggotegg4: 2, maggotegg5: 2, maggotegg6: 2,
  sarcophagus: 2,
  // Act 3
  mephisto: 3, councilmember1: 3, councilmember2: 3, councilmember3: 3,
  mosquito1: 3, mosquito2: 3, mosquito3: 3, mosquito4: 3,
  tentacle1: 3, tentacle2: 3, tentacle3: 3,
  tentaclehead1: 3, tentaclehead2: 3, tentaclehead3: 3,
  compellingorb: 3,
  // Act 4
  diablo: 4, izual: 4, hephasto: 4,
  trappedsoul1: 4, trappedsoul2: 4, mephistospirit: 4,
  lightningspire: 4, firetower: 4, wakeofdestruction: 4,
  suicideminion1: 4, suicideminion2: 4, suicideminion3: 4, suicideminion4: 4,
  suicideminion5: 4, suicideminion6: 4, suicideminion7: 4, suicideminion8: 4,
  suicideminion9: 4, suicideminion10: 4, suicideminion11: 4,
  // Act 5
  baalcrab: 5, nihlathakboss: 5,
  baalthrone: 5, baalclone: 5,
  baaltentacle1: 5, baaltentacle2: 5, baaltentacle3: 5, baaltentacle4: 5, baaltentacle5: 5,
  ancientbarb1: 5, ancientbarb2: 5, ancientbarb3: 5,
  painworm1: 5, painworm2: 5, painworm3: 5, painworm4: 5, painworm5: 5,
  act5pow: 5,
};

function lerp(a: number, b: number, t: number): number { return a + t * (b - a); }

function safeScale(val: string, factor: number): string {
  const n = parseInt(val, 10);
  if (isNaN(n) || n <= 0) return val;
  return String(Math.max(0, Math.round(n * factor)));
}

export interface ActShuffleResult {
  rows: string[][];
  actPositions: number[]; // sorted ascending [0..1], index = act-1; Act 1 always easiest
}

/**
 * Derive a RNG seed from the main seed for act-shuffle specifically,
 * so the act mapping is deterministic and independent of skill-randomizer RNG state.
 */
export function actShuffleSeed(seed: number): number {
  return (seed ^ 0xDEADBEEF) | 0;
}

/**
 * Compute 5 sorted positions in [0,1) from an RNG.
 * Act 1 always gets the smallest position (easiest), Act 5 always gets the largest (hardest).
 * The gaps between acts vary randomly per seed.
 */
export function computeActPositions(rng: SeededRNG): number[] {
  return [rng.next(), rng.next(), rng.next(), rng.next(), rng.next()]
    .sort((a, b) => a - b);
}

export function shuffleActs(
  rng: SeededRNG,
  headers: string[],
  rows: string[][],
): ActShuffleResult {
  const actPositions = computeActPositions(rng);
  const tcIdx = headers.indexOf('TreasureClass');

  const modifiedRows = rows.map(row => {
    const id = row[0];
    let sourceAct: number | null = null;

    if (tcIdx !== -1) {
      const tc = row[tcIdx] ?? '';
      const m = tc.match(ACT_RE);
      sourceAct = m ? parseInt(m[2]) : (BOSS_ACTS[id] ?? null);
    }

    if (sourceAct === null) return row;

    const targetPos = actPositions[sourceAct - 1];
    const targetActInt = Math.round(1 + targetPos * 4); // 1–5

    const hpFactor  = lerp(ACT_HP_MULT[1],  ACT_HP_MULT[5],  targetPos) / ACT_HP_MULT[sourceAct];
    const dmgFactor = lerp(ACT_DMG_MULT[1], ACT_DMG_MULT[5], targetPos) / ACT_DMG_MULT[sourceAct];
    const xpFactor  = lerp(ACT_XP_MULT[1],  ACT_XP_MULT[5],  targetPos) / ACT_XP_MULT[sourceAct];
    const acFactor  = lerp(ACT_AC_MULT[1],  ACT_AC_MULT[5],  targetPos) / ACT_AC_MULT[sourceAct];
    const lvlRatio  = lerp(ACT_AVG_LVL[1],  ACT_AVG_LVL[5],  targetPos) / ACT_AVG_LVL[sourceAct];
    const isBoss    = BOSS_ACTS[id] !== undefined;

    const scaled = [...row];

    for (const col of HP_COLS) {
      const idx = headers.indexOf(col);
      if (idx !== -1) scaled[idx] = safeScale(scaled[idx], hpFactor);
    }

    for (const col of XP_COLS) {
      const idx = headers.indexOf(col);
      if (idx !== -1) scaled[idx] = safeScale(scaled[idx], xpFactor);
    }

    for (const col of [...DMG_COLS, ...AR_COLS]) {
      const idx = headers.indexOf(col);
      if (idx !== -1) scaled[idx] = safeScale(scaled[idx], dmgFactor);
    }

    for (const col of AC_COLS) {
      const idx = headers.indexOf(col);
      if (idx !== -1) scaled[idx] = safeScale(scaled[idx], acFactor);
    }

    for (const col of LVL_COLS) {
      const idx = headers.indexOf(col);
      if (idx === -1) continue;
      const n = parseInt(scaled[idx], 10);
      if (!isNaN(n) && n > 0) {
        scaled[idx] = String(Math.max(1, Math.min(110, Math.round(n * lvlRatio))));
      }
    }

    if (!isBoss) {
      for (const col of TC_COLS) {
        const idx = headers.indexOf(col);
        if (idx === -1) continue;
        const tc = scaled[idx];
        if (tc) scaled[idx] = tc.replace(ACT_RE, (_, prefix) => `${prefix}${targetActInt}`);
      }
    }

    return scaled;
  });

  return { rows: modifiedRows, actPositions };
}
