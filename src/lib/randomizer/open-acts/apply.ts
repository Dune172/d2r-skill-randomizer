import type { OpenActsShuffle } from './fill';
import type { HostModes, ItemCode } from './pool';

/**
 * Write an Open Acts shuffle into the game tables (all difficulties):
 *   - objects.txt: each pool host gets the OperateFn of the item it now gives
 *   - bosses: every treasure-class column of the monster/superunique is wrapped in a TC
 *     that drops the key item and then the original loot, on every kill (so a lost item
 *     can be farmed again). The wrapper is the arena mod's, proven in game on 2026-10-26.
 */

export interface Table {
  headers: string[];
  rows: string[][];
}

export interface OpenActsTables {
  objects: Table;
  monstats: Table;
  superuniques: Table;
  treasureclass: Table;
}

const SUPERUNIQUE_TC_COLUMNS = ['TC', 'TC Desecrated', 'TC(N)', 'TC(N) Desecrated', 'TC(H)', 'TC(H) Desecrated'];

function col(t: Table, name: string): number {
  const i = t.headers.indexOf(name);
  if (i < 0) throw new Error(`open-acts: table has no ${name} column`);
  return i;
}

/** objects.txt Mode1 per Class: false for hosts without an OPERATING animation. */
export function hostModes(objects: Table): HostModes {
  const cls = col(objects, 'Class');
  const mode1 = col(objects, 'Mode1');
  const modes = new Map<string, boolean>();
  for (const row of objects.rows) if (row[cls]) modes.set(row[cls], row[mode1] === '1');
  return modes;
}

export function applyOpenActsShuffle(shuffle: OpenActsShuffle, t: OpenActsTables): void {
  const cls = col(t.objects, 'Class');
  const operateFn = col(t.objects, 'OperateFn');
  for (const [objectClass, handler] of shuffle.objectHandlers) {
    const rows = t.objects.rows.filter(r => r[cls] === objectClass);
    if (!rows.length) throw new Error(`open-acts: objects.txt has no ${objectClass}`);
    for (const row of rows) row[operateFn] = String(handler);
  }

  const tcName = col(t.treasureclass, 'Treasure Class');
  const known = new Set(t.treasureclass.rows.map(r => r[tcName]).filter(Boolean));
  const wrappers = new Map<string, string>();
  const wrap = (original: string, item: ItemCode): string => {
    // Only real treasure classes: monstats also has TreasureClassQuestTriggerId/Cmd numbers.
    if (!original || !known.has(original)) return original;
    const cacheKey = `${item}|${original}`;
    const existing = wrappers.get(cacheKey);
    if (existing) return existing;
    const key = `OpenActs_${item}_${wrappers.size}`;
    const row = new Array(t.treasureclass.headers.length).fill('');
    const fields: Record<string, string> = {
      'Treasure Class': key, Picks: '-2', NoDrop: '0',
      Item1: item, Prob1: '1', Item2: original, Prob2: '1', '*eol': '0',
    };
    for (const [field, value] of Object.entries(fields)) {
      const i = t.treasureclass.headers.indexOf(field);
      if (i >= 0) row[i] = value;
    }
    t.treasureclass.rows.push(row);
    known.add(key);
    wrappers.set(cacheKey, key);
    return key;
  };

  const monId = col(t.monstats, 'Id');
  const monTcCols = t.monstats.headers
    .map((h, i) => [h, i] as const)
    .filter(([h]) => /^TreasureClass/.test(h) && !/TriggerId|Cmd/.test(h))
    .map(([, i]) => i);
  const suName = col(t.superuniques, 'Superunique');
  const suTcCols = SUPERUNIQUE_TC_COLUMNS.filter(h => t.superuniques.headers.includes(h)).map(h => col(t.superuniques, h));

  for (const { location, item } of shuffle.bossDrops) {
    if (location.kind !== 'boss') continue;
    let wrapped = 0;
    if (location.monstats) {
      const row = t.monstats.rows.find(r => r[monId] === location.monstats);
      if (!row) throw new Error(`open-acts: monstats.txt has no ${location.monstats}`);
      for (const i of monTcCols) {
        const next = wrap(row[i], item);
        if (next !== row[i]) { row[i] = next; wrapped++; }
      }
    }
    if (location.superunique) {
      const row = t.superuniques.rows.find(r => r[suName] === location.superunique);
      if (!row) throw new Error(`open-acts: superuniques.txt has no ${location.superunique}`);
      for (const i of suTcCols) {
        const next = wrap(row[i], item);
        if (next !== row[i]) { row[i] = next; wrapped++; }
      }
    }
    if (!wrapped) throw new Error(`open-acts: ${location.id} has no treasure class to carry ${item}`);
  }
}
