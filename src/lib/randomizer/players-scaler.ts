// Column names as they appear in monstats.txt (mixed case)
const HP_COLS = ['minHP', 'maxHP', 'MinHP(N)', 'MaxHP(N)', 'MinHP(H)', 'MaxHP(H)'];
const EXP_COLS = ['Exp', 'Exp(N)', 'Exp(H)'];
const TC_COL = 'TreasureClass';
const ACT_RE = /^Act (\d)/;

// Combat monsters whose TreasureClass doesn't contain "Act N" but belong to a specific act.
// Player summons (golem, valkyrie, druidbear), Uber bosses, Cow Level, and map objects are omitted.
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

/**
 * Scale monster HP and experience to simulate the effect of /players N.
 * Formula: multiplier = 1 + (playerCount - 1) * 0.5
 * (matches D2 engine: 1p→1×, 2p→1.5×, 4p→2.5×, 8p→4.5×)
 * Monster damage is intentionally NOT scaled — only HP and Exp.
 * Only monsters belonging to the specified acts are scaled.
 */
export function scaleMonstats(
  headers: string[],
  rows: string[][],
  playerCount: number,
  acts: number[] = [1, 2, 3, 4, 5],
): string[][] {
  const multiplier = 1 + (playerCount - 1) * 0.5;
  const colsToScale = [...HP_COLS, ...EXP_COLS];
  const tcIdx = headers.indexOf(TC_COL);
  const actsSet = new Set(acts);

  return rows.map(row => {
    const id = row[0];
    let monsterAct: number | null = null;
    if (tcIdx !== -1) {
      const tc = row[tcIdx] ?? '';
      const m = tc.match(ACT_RE);
      monsterAct = m ? parseInt(m[1]) : (BOSS_ACTS[id] ?? null);
    }
    if (monsterAct === null || !actsSet.has(monsterAct)) return row;

    const scaled = [...row];
    for (const col of colsToScale) {
      const idx = headers.indexOf(col);
      if (idx === -1) continue;
      const val = parseInt(scaled[idx], 10);
      if (!isNaN(val) && val > 0) {
        scaled[idx] = String(Math.round(val * multiplier));
      }
    }
    return scaled;
  });
}
