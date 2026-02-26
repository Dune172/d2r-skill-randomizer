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

function safeScale(val: string, factor: number): string {
  const n = parseInt(val, 10);
  if (isNaN(n) || n <= 0) return val;
  return String(Math.max(0, Math.round(n * factor)));
}

export interface ActShuffleResult {
  rows: string[][];
  actOrder: number[]; // permutation: actOrder[i] = original act at difficulty position i+1
}

/**
 * Derive a RNG seed from the main seed for act-shuffle specifically,
 * so the act mapping is deterministic and independent of skill-randomizer RNG state.
 */
export function actShuffleSeed(seed: number): number {
  return (seed ^ 0xDEADBEEF) | 0;
}

/**
 * Generate a random permutation of [1,2,3,4,5] using Fisher-Yates.
 * actOrder[i] = which original act's content is at shuffled position i+1.
 * Example: [5,3,1,2,4] means Act 5 is the first/easiest, Act 3 is second, etc.
 */
export function computeActPermutation(rng: SeededRNG): number[] {
  const arr = [1, 2, 3, 4, 5];
  for (let i = 4; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function shuffleActs(
  rng: SeededRNG,
  headers: string[],
  rows: string[][],
): ActShuffleResult {
  const actOrder = computeActPermutation(rng);
  const tcIdx = headers.indexOf('TreasureClass');

  // Build inverse map: difficultyOf[sourceAct] = target difficulty level (1–5)
  // actOrder[i] = original act at position i+1, so original act actOrder[i] gets difficulty i+1
  const difficultyOf: Record<number, number> = {};
  for (let i = 0; i < actOrder.length; i++) {
    difficultyOf[actOrder[i]] = i + 1;
  }

  const modifiedRows = rows.map(row => {
    const id = row[0];
    let sourceAct: number | null = null;

    if (tcIdx !== -1) {
      const tc = row[tcIdx] ?? '';
      const m = tc.match(ACT_RE);
      sourceAct = m ? parseInt(m[2]) : (BOSS_ACTS[id] ?? null);
    }

    if (sourceAct === null) return row;

    const targetDifficulty = difficultyOf[sourceAct];
    if (targetDifficulty === undefined) return row;

    const hpFactor  = ACT_HP_MULT[targetDifficulty]  / ACT_HP_MULT[sourceAct];
    const dmgFactor = ACT_DMG_MULT[targetDifficulty] / ACT_DMG_MULT[sourceAct];
    const xpFactor  = ACT_XP_MULT[targetDifficulty]  / ACT_XP_MULT[sourceAct];
    const acFactor  = ACT_AC_MULT[targetDifficulty]  / ACT_AC_MULT[sourceAct];
    const lvlRatio  = ACT_AVG_LVL[targetDifficulty]  / ACT_AVG_LVL[sourceAct];
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
        if (tc) scaled[idx] = tc.replace(ACT_RE, (_, prefix) => `${prefix}${targetDifficulty}`);
      }
    }

    return scaled;
  });

  return { rows: modifiedRows, actOrder };
}
