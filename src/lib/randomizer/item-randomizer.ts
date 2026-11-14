/**
 * Item property randomizer: rerolls the stats on unique items, set items, set bonuses and
 * runewords.
 *
 * The approach follows d2modgen's item randomizer (github.com/mapron/d2modgen, BSL-1.0):
 * every property line in the vanilla tables goes into a pool keyed by the kind of item it
 * sits on (weapon, armor, ring, ...) and that item's level band (1–19, 20–39, ...). Each
 * item then draws its new lines from the pool for its own kind and band, so a level-20
 * ring gets lines that some level-20 ring, amulet or set piece really had, with the same
 * value ranges. That keeps rerolled items roughly as strong as the items they replace.
 *
 * Skill lines (+N to a skill, chance to cast, charges, auras, oskills) are drawn with their
 * VANILLA skill references. This step runs before the skill remap in item-skills-writer.ts,
 * which then translates every one of them into the shuffled skill rows exactly as it does
 * for vanilla items. That is the part d2modgen cannot do: its skill lines point at whatever
 * skill a seed moved into the row.
 *
 * Uses its own RNG stream, so a seed's skill trees and every other pick are the same
 * whether or not items are randomized.
 */
import type { SeededRNG } from './seed';
import type { ItemRandoLevel } from '@/lib/item-rando';

export type { ItemRandoLevel };

interface Table { headers: string[]; rows: string[][] }

export interface ItemRandoTables {
  uniqueitems: Table;
  setitems: Table;
  sets: Table;
  runes: Table;
  armor: Table;
  weapons: Table;
  misc: Table;
  itemtypes: Table;
}

export interface ItemRandoReport {
  /** Items whose lines were considered (rows that have at least one line to reroll). */
  items: number;
  /** Property lines replaced. */
  rerolled: number;
  /** Property lines left in place on purpose (see FIXED_PROPS) or kept by the Partly setting. */
  kept: number;
}

/** The kind of item a line sits on; lines only move between items of the same kind. */
type Slot = 'weapon' | 'armor' | 'accessory' | 'ring' | 'amulet' | 'charm' | 'setbonus';

interface PropLine { code: string; par: string; min: string; max: string }

interface PoolEntry extends PropLine { bowOnly: boolean }

/** One property slot in a table row: the four columns that hold a line. */
interface PropCols { code: number; par: number; min: number; max: number }

/**
 * Lines that stay where they are and never enter a pool. They describe the item itself
 * (sockets, ethereal, durability, quantity), only work on one specific item (Hellfire
 * Torch's random class skills, the Sunder charms, the RotW affix bundles, Eternity's
 * rebuild), or are commented-out entries the game ignores.
 */
const FIXED_PROPS: ReadonlySet<string> = new Set([
  'sock', 'ethereal', 'indestruct', 'dur', 'rep-dur', 'rep-quant', 'stack',
  'randclassskill', 'skilltab-war', 'state', 'fade', 'eternity-update', 'charge-noconsume',
  'roguesbow-affix1', 'skill-rand', 'magdam-rand', 'reanimate',
]);
const isFixed = (code: string): boolean =>
  FIXED_PROPS.has(code) || code.startsWith('*') || /-Affix\d+$/i.test(code) || code.startsWith('pierce-immunity-');

/** Lines that only do anything on bows and crossbows. */
const BOW_ONLY: ReadonlySet<string> = new Set(['explosivearrow', 'magicarrow']);

/** At most one of each of these per item (a second aura or state does nothing). */
const ONE_PER_ITEM: ReadonlySet<string> = new Set(['aura']);

const MAX_BAND = 4;
const bandOf = (level: number): number => Math.max(0, Math.min(MAX_BAND, Math.floor(level / 20)));

/** A pool for one slot and band should offer at least this many lines before it borrows. */
const MIN_POOL = 12;

function col(t: Table, name: string): number {
  return t.headers.indexOf(name);
}

/** Every property slot in a table whose columns follow `code/par/min/max` naming. */
function propCols(t: Table, names: [string, string, string, string][]): PropCols[] {
  const out: PropCols[] = [];
  for (const [c, p, mi, ma] of names) {
    const cols = { code: col(t, c), par: col(t, p), min: col(t, mi), max: col(t, ma) };
    if (cols.code !== -1 && cols.par !== -1 && cols.min !== -1 && cols.max !== -1) out.push(cols);
  }
  return out;
}

const range = (n: number, from = 1) => Array.from({ length: n }, (_, i) => i + from);

export const UNIQUE_PROP_NAMES = range(12).map(i => [`prop${i}`, `par${i}`, `min${i}`, `max${i}`] as [string, string, string, string]);
export const SETITEM_PROP_NAMES = range(9).map(i => [`prop${i}`, `par${i}`, `min${i}`, `max${i}`] as [string, string, string, string]);
export const SETITEM_APROP_NAMES = range(5).flatMap(i => (['a', 'b'] as const).map(s =>
  [`aprop${i}${s}`, `apar${i}${s}`, `amin${i}${s}`, `amax${i}${s}`] as [string, string, string, string]));
export const SET_PARTIAL_NAMES = range(4, 2).flatMap(i => (['a', 'b'] as const).map(s =>
  [`PCode${i}${s}`, `PParam${i}${s}`, `PMin${i}${s}`, `PMax${i}${s}`] as [string, string, string, string]));
export const SET_FULL_NAMES = range(8).map(i => [`FCode${i}`, `FParam${i}`, `FMin${i}`, `FMax${i}`] as [string, string, string, string]);
export const RUNEWORD_PROP_NAMES = range(7).map(i => [`T1Code${i}`, `T1Param${i}`, `T1Min${i}`, `T1Max${i}`] as [string, string, string, string]);

/** Item code -> its type codes plus every type they are equivalent to (itemtypes.txt). */
function buildTypeResolver(t: ItemRandoTables): (itemCode: string) => Set<string> {
  const equiv = new Map<string, string[]>();
  {
    const code = col(t.itemtypes, 'Code');
    const e1 = col(t.itemtypes, 'Equiv1');
    const e2 = col(t.itemtypes, 'Equiv2');
    for (const r of t.itemtypes.rows) {
      if (r[code]) equiv.set(r[code], [r[e1], r[e2]].filter(Boolean));
    }
  }
  const baseTypes = new Map<string, string[]>();
  for (const table of [t.armor, t.weapons, t.misc]) {
    const code = col(table, 'code');
    const type = col(table, 'type');
    const type2 = col(table, 'type2');
    for (const r of table.rows) {
      if (r[code]) baseTypes.set(r[code], [r[type], r[type2]].filter(Boolean));
    }
  }
  const cache = new Map<string, Set<string>>();
  const closure = (types: string[]): Set<string> => {
    const seen = new Set<string>();
    const stack = [...types];
    while (stack.length) {
      const ty = stack.pop()!;
      if (seen.has(ty)) continue;
      seen.add(ty);
      stack.push(...(equiv.get(ty) ?? []));
    }
    return seen;
  };
  return (itemCode: string) => {
    let hit = cache.get(itemCode);
    if (!hit) {
      // Runewords and the like name an item TYPE rather than a base item.
      hit = closure(baseTypes.get(itemCode) ?? [itemCode]);
      cache.set(itemCode, hit);
    }
    return hit;
  };
}

function slotOf(types: Set<string>): Slot | null {
  if (types.has('weap')) return 'weapon';
  if (types.has('ring')) return 'ring';
  if (types.has('amul')) return 'amulet';
  if (types.has('char') || types.has('jewl')) return 'charm';
  if (types.has('glov') || types.has('boot') || types.has('belt')) return 'accessory';
  if (types.has('tors') || types.has('helm') || types.has('shld')) return 'armor';
  return null;
}

/** An item to reroll: where its lines live and which pool it draws from. */
interface Target {
  row: string[];
  cols: PropCols[];
  slot: Slot;
  band: number;
  bow: boolean;
}

function readLine(row: string[], c: PropCols): PropLine {
  return { code: row[c.code] ?? '', par: row[c.par] ?? '', min: row[c.min] ?? '', max: row[c.max] ?? '' };
}

function writeLine(row: string[], c: PropCols, line: PropLine): void {
  row[c.code] = line.code;
  row[c.par] = line.par;
  row[c.min] = line.min;
  row[c.max] = line.max;
}

const lineKey = (l: PropLine) => `${l.code}\u0000${l.par}`;

/**
 * Collect every rerollable item from the four tables, then reroll each one in table
 * order. Mutates the unique, set item, set and runeword rows in place.
 */
export function randomizeItemProperties(
  tables: ItemRandoTables,
  level: ItemRandoLevel,
  rng: SeededRNG,
): ItemRandoReport {
  const report: ItemRandoReport = { items: 0, rerolled: 0, kept: 0 };
  if (level === 0) return report;

  const typesOf = buildTypeResolver(tables);
  const targets: Target[] = [];

  const enabled = (t: Table, r: string[]) => {
    const disabled = col(t, 'disabled');
    return disabled === -1 || r[disabled] !== '1';
  };

  // Unique items.
  {
    const t = tables.uniqueitems;
    const code = col(t, 'code');
    const lvl = col(t, 'lvl');
    const cols = propCols(t, UNIQUE_PROP_NAMES);
    for (const r of t.rows) {
      if (!r[code] || !enabled(t, r)) continue;
      const types = typesOf(r[code]);
      const slot = slotOf(types);
      if (!slot) continue;
      targets.push({ row: r, cols, slot, band: bandOf(Number(r[lvl]) || 0), bow: types.has('miss') && !types.has('thro') });
    }
  }

  // Set items: their own (blue) lines and their partial set (green) lines both draw from
  // the item's slot. A set's level is its highest piece's level.
  const setLevels = new Map<string, number>();
  {
    const t = tables.setitems;
    const item = col(t, 'item');
    const set = col(t, 'set');
    const lvl = col(t, 'lvl');
    const own = propCols(t, SETITEM_PROP_NAMES);
    const green = propCols(t, SETITEM_APROP_NAMES);
    for (const r of t.rows) {
      if (!r[item] || !enabled(t, r)) continue;
      const level = Number(r[lvl]) || 0;
      if (r[set]) setLevels.set(r[set], Math.max(setLevels.get(r[set]) ?? 0, level));
      const types = typesOf(r[item]);
      const slot = slotOf(types);
      if (!slot) continue;
      const bow = types.has('miss') && !types.has('thro');
      targets.push({ row: r, cols: own, slot, band: bandOf(level), bow });
      targets.push({ row: r, cols: green, slot, band: bandOf(level), bow });
    }
  }

  // Whole-set bonuses (partial and full) draw from their own pool: they apply to the
  // character, not to one piece, so any line any set grants is fair game.
  {
    const t = tables.sets;
    const index = col(t, 'index');
    const cols = [...propCols(t, SET_PARTIAL_NAMES), ...propCols(t, SET_FULL_NAMES)];
    for (const r of t.rows) {
      if (!r[index] || !setLevels.has(r[index])) continue;
      targets.push({ row: r, cols, slot: 'setbonus', band: bandOf(setLevels.get(r[index])!), bow: false });
    }
  }

  // Runewords: the slot comes from the first allowed item type, the level from the
  // highest rune (misc.txt), which is when the runeword becomes makeable.
  {
    const t = tables.runes;
    const complete = col(t, 'complete');
    const itype1 = col(t, 'itype1');
    const runeCols = range(6).map(i => col(t, `Rune${i}`)).filter(c => c !== -1);
    const miscCode = col(tables.misc, 'code');
    const miscLevel = col(tables.misc, 'level');
    const runeLevel = new Map(tables.misc.rows.map(r => [r[miscCode], Number(r[miscLevel]) || 0]));
    const cols = propCols(t, RUNEWORD_PROP_NAMES);
    for (const r of t.rows) {
      if (r[complete] !== '1' || !r[itype1]) continue;
      const types = typesOf(r[itype1]);
      const slot = slotOf(types);
      if (!slot) continue;
      const level = Math.max(0, ...runeCols.map(c => runeLevel.get(r[c]) ?? 0));
      targets.push({ row: r, cols, slot, band: bandOf(level), bow: types.has('miss') && !types.has('thro') });
    }
  }

  // Pools, built from the vanilla lines before anything is rewritten.
  const pools = new Map<string, PoolEntry[]>();
  const poolKey = (slot: Slot, band: number) => `${slot}:${band}`;
  for (const tg of targets) {
    for (const c of tg.cols) {
      const line = readLine(tg.row, c);
      if (!line.code || isFixed(line.code)) continue;
      const key = poolKey(tg.slot, tg.band);
      (pools.get(key) ?? pools.set(key, []).get(key)!).push({ ...line, bowOnly: BOW_ONLY.has(line.code) });
    }
  }

  // A thin pool borrows from the nearest bands of the same slot, nearest first.
  const resolved = new Map<string, PoolEntry[]>();
  const poolFor = (slot: Slot, band: number): PoolEntry[] => {
    const key = poolKey(slot, band);
    const hit = resolved.get(key);
    if (hit) return hit;
    const out = [...(pools.get(key) ?? [])];
    for (let d = 1; out.length < MIN_POOL && d <= MAX_BAND; d++) {
      for (const b of [band - d, band + d]) {
        if (b >= 0 && b <= MAX_BAND) out.push(...(pools.get(poolKey(slot, b)) ?? []));
      }
    }
    resolved.set(key, out);
    return out;
  };

  const keepChance = level === 1 ? 0.5 : 0;

  for (const tg of targets) {
    const lines = tg.cols.map(c => readLine(tg.row, c));
    const rerollable = lines.map(l => !!l.code && !isFixed(l.code));
    if (!rerollable.some(Boolean)) continue;
    report.items++;

    const pool = poolFor(tg.slot, tg.band).filter(e => tg.bow || !e.bowOnly);
    // Decide which lines go first, so the lines an item keeps are known before any draw
    // and a draw never duplicates one of them.
    const replace = lines.map((l, i) => rerollable[i] && rng.next() >= keepChance);
    const taken = new Set<string>();
    const takenCodes = new Set<string>();
    lines.forEach((l, i) => {
      if (l.code && !replace[i]) {
        taken.add(lineKey(l));
        takenCodes.add(l.code);
        if (rerollable[i]) report.kept++;
      }
    });

    lines.forEach((_, i) => {
      if (!replace[i]) return;
      // A few attempts at a line the item does not already have; otherwise leave the
      // vanilla line, which is always valid on this item.
      for (let attempt = 0; attempt < 8 && pool.length; attempt++) {
        const pick = pool[rng.randInt(0, pool.length - 1)];
        if (taken.has(lineKey(pick))) continue;
        if (ONE_PER_ITEM.has(pick.code) && takenCodes.has(pick.code)) continue;
        writeLine(tg.row, tg.cols[i], pick);
        taken.add(lineKey(pick));
        takenCodes.add(pick.code);
        report.rerolled++;
        return;
      }
      taken.add(lineKey(lines[i]));
      takenCodes.add(lines[i].code);
      report.kept++;
    });
  }

  return report;
}
