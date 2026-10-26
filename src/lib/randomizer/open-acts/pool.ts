/**
 * Open Acts: the items and locations of the cross-act key-item shuffle.
 *
 * Acts I–III are open from the start (a patched starter save sets the act-access quest
 * flags and town waypoints). Progress is then gated only by items:
 *   - Tristram needs the Key to the Cairn Stones (Inifuss scroll decoded by Akara)
 *   - Duriel needs the Horadric Staff = Cube + Staff of Kings + Viper amulet (fixed)
 *   - Mephisto needs Khalim's Will = Cube + Flail (fixed) + Heart + Eye + Brain
 *
 * Object items move by giving a host object the item's quest handler (objects.txt
 * OperateFn). The handlers never check the act or level they run in, and re-drop when the
 * player lacks the item. Boss items are a guaranteed extra pick wrapped around every
 * treasure-class column of the monster.
 *
 * Fixed in vanilla places: the Viper amulet (its altar only completes Tainted Sun inside
 * Act II, and that quest opens the Palace on the way to Duriel) and Khalim's Flail (a
 * Council drop coded to that monster).
 */

export type Act = 1 | 2 | 3;

export type ItemCode = 'box' | 'msf' | 'bks' | 'qhr' | 'qey' | 'qbr' | 'hdm' | 'bbb' | 'leg';

export interface PoolItem {
  code: ItemCode;
  name: string;
  /** objects.txt OperateFn that drops this item. */
  handler: number;
  /** Key items gate progress and are placed by logic; fillers only fill object slots. */
  key: boolean;
  vanillaAct: Act;
  /** Only object hosts can give it (its quest state is set by the handler itself). */
  objectOnly: boolean;
  /** The handler forces the OPERATING animation, so the host needs Mode1 frames. */
  needsOperatingMode: boolean;
}

export const ITEMS: Record<ItemCode, PoolItem> = {
  box: { code: 'box', name: 'Horadric Cube', handler: 39, key: true, vanillaAct: 2, objectOnly: false, needsOperatingMode: false },
  msf: { code: 'msf', name: 'Staff of Kings', handler: 41, key: true, vanillaAct: 2, objectOnly: false, needsOperatingMode: false },
  // Akara decodes the scroll only if the Inifuss handler started the quest step, so it
  // never comes from a treasure class.
  bks: { code: 'bks', name: 'Scroll of Inifuss', handler: 12, key: true, vanillaAct: 1, objectOnly: true, needsOperatingMode: true },
  qhr: { code: 'qhr', name: "Khalim's Heart", handler: 57, key: true, vanillaAct: 3, objectOnly: false, needsOperatingMode: false },
  qey: { code: 'qey', name: "Khalim's Eye", handler: 58, key: true, vanillaAct: 3, objectOnly: false, needsOperatingMode: false },
  qbr: { code: 'qbr', name: "Khalim's Brain", handler: 59, key: true, vanillaAct: 3, objectOnly: false, needsOperatingMode: false },
  hdm: { code: 'hdm', name: 'Horadric Malus', handler: 21, key: false, vanillaAct: 1, objectOnly: true, needsOperatingMode: false },
  bbb: { code: 'bbb', name: "Lam Esen's Tome", handler: 28, key: false, vanillaAct: 3, objectOnly: true, needsOperatingMode: true },
  leg: { code: 'leg', name: "Wirt's Leg", handler: 33, key: false, vanillaAct: 1, objectOnly: true, needsOperatingMode: true },
};

/** Handler used for an object slot left without a pool item (a plain chest). */
export const PLAIN_CHEST_HANDLER = 4;

export type Gate = 'none' | 'tristram' | 'duriel';

export type LocationId =
  | 'inifuss-tree' | 'malus' | 'wirt' | 'cube-chest' | 'staff-chest'
  | 'lam-esen' | 'heart-chest' | 'eye-chest' | 'brain-chest'
  | 'blood-raven' | 'andariel' | 'griswold' | 'radament' | 'summoner' | 'duriel'
  | 'sarina' | 'icehawk';

interface LocationBase {
  id: LocationId;
  /** Where the player finds it, in player-facing words. */
  name: string;
  act: Act;
  gate: Gate;
}

export interface ObjectLocation extends LocationBase {
  kind: 'object';
  /** objects.txt Class of the host row. */
  objectClass: string;
  /** objects.txt Name is "chest": a vacant slot becomes a plain chest. */
  chest: boolean;
  /** The pool item this host gives in vanilla. */
  vanilla: ItemCode;
}

export interface BossLocation extends LocationBase {
  kind: 'boss';
  /** Rows whose treasure-class columns get the wrapper (all difficulties). */
  monstats?: string;
  superunique?: string;
}

export type PoolLocation = ObjectLocation | BossLocation;

export const LOCATIONS: PoolLocation[] = [
  { id: 'inifuss-tree', kind: 'object', name: 'the Tree of Inifuss in the Dark Wood', act: 1, gate: 'none', objectClass: 'InifussTree', chest: false, vanilla: 'bks' },
  { id: 'malus', kind: 'object', name: 'the Barracks', act: 1, gate: 'none', objectClass: 'Malus', chest: false, vanilla: 'hdm' },
  { id: 'wirt', kind: 'object', name: "Wirt's body in Tristram", act: 1, gate: 'tristram', objectClass: 'Wirt', chest: false, vanilla: 'leg' },
  { id: 'cube-chest', kind: 'object', name: 'the Halls of the Dead', act: 2, gate: 'none', objectClass: 'HoradricCubeChest', chest: true, vanilla: 'box' },
  { id: 'staff-chest', kind: 'object', name: 'the Maggot Lair', act: 2, gate: 'none', objectClass: 'StaffOfKingsChest', chest: true, vanilla: 'msf' },
  { id: 'lam-esen', kind: 'object', name: 'the Ruined Temple', act: 3, gate: 'none', objectClass: 'LamEsensTome', chest: false, vanilla: 'bbb' },
  { id: 'heart-chest', kind: 'object', name: 'the Kurast Sewers', act: 3, gate: 'none', objectClass: 'KhalimHeartChest', chest: true, vanilla: 'qhr' },
  { id: 'eye-chest', kind: 'object', name: 'the Spider Cavern', act: 3, gate: 'none', objectClass: 'KhalimEyeChest', chest: true, vanilla: 'qey' },
  { id: 'brain-chest', kind: 'object', name: 'the Flayer Dungeon', act: 3, gate: 'none', objectClass: 'KhalimBrainChest', chest: true, vanilla: 'qbr' },
  { id: 'blood-raven', kind: 'boss', name: 'Blood Raven', act: 1, gate: 'none', monstats: 'bloodraven' },
  { id: 'andariel', kind: 'boss', name: 'Andariel', act: 1, gate: 'none', monstats: 'andariel' },
  { id: 'griswold', kind: 'boss', name: 'Griswold', act: 1, gate: 'tristram', superunique: 'Griswold' },
  { id: 'radament', kind: 'boss', name: 'Radament', act: 2, gate: 'none', monstats: 'radament', superunique: 'Radament' },
  { id: 'summoner', kind: 'boss', name: 'the Summoner', act: 2, gate: 'none', monstats: 'summoner', superunique: 'The Summoner' },
  { id: 'duriel', kind: 'boss', name: 'Duriel', act: 2, gate: 'duriel', monstats: 'duriel' },
  { id: 'sarina', kind: 'boss', name: 'Battlemaid Sarina', act: 3, gate: 'none', superunique: 'Sarina the Battlemaid' },
  { id: 'icehawk', kind: 'boss', name: 'Icehawk Riftwing', act: 3, gate: 'none', superunique: 'Icehawk Riftwing' },
];

/**
 * Handlers proven (or vanilla) safe on a host without OPERATING frames (objects.txt
 * Mode1=0, which in practice is only the Malus). Chest handlers fall back to the OPENED
 * mode; the Malus handler is its own.
 */
export const NO_OPERATING_MODE_HANDLERS = new Set([21, 39, 41, 57, 58, 59]);

export interface OpenActsOptions {
  /** The character starts with the Cube (start-with-cube option), so it is not shuffled. */
  startWithCube: boolean;
  /** Boss locations are used (off if the in-game spike shows TC quest drops fail). */
  bossLocations: boolean;
  /**
   * Acts open from the start (the starter save sets their act-access flags). Act I is
   * always open. A closed Act II is still reached by killing Andariel, who needs nothing,
   * but a closed Act III is only reached through Duriel, so it inherits the Duriel gate.
   * Defaults to [2, 3], the original all-open design.
   */
  openActs?: Act[];
}

/** Whether `owned` lets the player reach `loc`: its own gate, plus Act III's access when that act starts closed. */
export function canReach(loc: PoolLocation, owned: ReadonlySet<ItemCode>, opts: OpenActsOptions): boolean {
  if (!gateOpen(loc.gate, owned)) return false;
  const open = opts.openActs ?? [2, 3];
  return loc.act !== 3 || open.includes(3) || gateOpen('duriel', owned);
}

export function keyItems(opts: OpenActsOptions): ItemCode[] {
  return (Object.values(ITEMS) as PoolItem[])
    .filter(i => i.key && !(opts.startWithCube && i.code === 'box'))
    .map(i => i.code);
}

export function fillerItems(): ItemCode[] {
  return (Object.values(ITEMS) as PoolItem[]).filter(i => !i.key).map(i => i.code);
}

export function activeLocations(opts: OpenActsOptions): PoolLocation[] {
  return LOCATIONS.filter(l => l.kind === 'object' || opts.bossLocations);
}

/** Whether `owned` opens a gate. The Viper amulet and Khalim's Flail are always reachable. */
export function gateOpen(gate: Gate, owned: ReadonlySet<ItemCode>): boolean {
  switch (gate) {
    case 'none': return true;
    case 'tristram': return owned.has('bks');
    case 'duriel': return owned.has('box') && owned.has('msf');
  }
}

/** Mephisto: Khalim's Will needs the Cube and all three organs. */
export function goalReached(owned: ReadonlySet<ItemCode>): boolean {
  return owned.has('box') && owned.has('qhr') && owned.has('qey') && owned.has('qbr');
}

/** Mode1 per objects.txt Class, so host rules come from data, not a hand list. */
export type HostModes = ReadonlyMap<string, boolean>;

export function canHost(loc: PoolLocation, item: PoolItem, hostHasOperatingMode: HostModes): boolean {
  if (loc.kind === 'boss') return item.key && !item.objectOnly;
  const hasMode = hostHasOperatingMode.get(loc.objectClass);
  if (hasMode === undefined) throw new Error(`open-acts: no objects.txt row for ${loc.objectClass}`);
  if (hasMode) return true;
  return !item.needsOperatingMode && NO_OPERATING_MODE_HANDLERS.has(item.handler);
}
