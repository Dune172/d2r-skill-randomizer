import { createRNG, type SeededRNG } from '../seed';
import {
  ITEMS, PLAIN_CHEST_HANDLER, activeLocations, canHost, canReach, fillerItems, gateOpen, goalReached, keyItems,
  type Act, type HostModes, type ItemCode, type LocationId, type ObjectLocation, type OpenActsOptions,
  type PoolLocation,
} from './pool';

/** Sub-RNG tag ('OPNA'): the main pipeline's RNG order and every existing seed stay as they were. */
export const OPEN_ACTS_RNG_TAG = 0x4f504e41;
const MAX_TRIES = 500;

export interface ManifestEntry {
  item: ItemCode;
  itemName: string;
  key: boolean;
  location: LocationId;
  locationName: string;
  act: Act;
  kind: 'object' | 'boss';
  /** Playthrough sphere the item is collected in (0 = reachable from the start). */
  sphere: number;
}

export interface OpenActsShuffle {
  /** Item at each filled location. */
  placements: Map<LocationId, ItemCode>;
  /** OperateFn for every object host in the pool, including vacant ones. */
  objectHandlers: Map<string, number>;
  /** Boss rows that get a guaranteed drop. */
  bossDrops: { location: PoolLocation; item: ItemCode }[];
  manifest: ManifestEntry[];
  tries: number;
}

interface Sweep {
  owned: Set<ItemCode>;
  /** Location ids by sphere. */
  spheres: LocationId[][];
}

/**
 * Collect everything reachable, sphere by sphere: items found in one sphere open gates in the
 * next. `opts` decides which acts start open; without it all three do.
 */
export function sweep(
  locs: PoolLocation[], placed: ReadonlyMap<LocationId, ItemCode>, start: Iterable<ItemCode>,
  opts: OpenActsOptions = { startWithCube: false, bossLocations: true },
): Sweep {
  const owned = new Set(start);
  const visited = new Set<LocationId>();
  const spheres: LocationId[][] = [];
  for (;;) {
    const sphere = locs.filter(l => !visited.has(l.id) && canReach(l, owned, opts)).map(l => l.id);
    if (!sphere.length) break;
    for (const id of sphere) visited.add(id);
    spheres.push(sphere);
    for (const id of sphere) {
      const item = placed.get(id);
      if (item) owned.add(item);
    }
  }
  return { owned, spheres };
}

function pick<T>(rng: SeededRNG, xs: T[]): T {
  return xs[Math.floor(rng.next() * xs.length)];
}

function attempt(rng: SeededRNG, opts: OpenActsOptions, modes: HostModes): Map<LocationId, ItemCode> | null {
  const locs = activeLocations(opts);
  const start: ItemCode[] = opts.startWithCube ? ['box'] : [];
  let keys = rng.shuffle(keyItems(opts));
  const placed = new Map<LocationId, ItemCode>();

  // With bosses in the pool, build the two-step chain up front instead of hoping the
  // fill finds one: a Horadric Staff part behind Tristram, and a Khalim organ on Duriel.
  // Seeds then share an order to discover: scroll -> Tristram -> Duriel -> Mephisto.
  if (opts.bossLocations) {
    const staffPart = pick(rng, keys.filter(k => k === 'msf' || k === 'box'));
    const tristram = locs.filter(l => l.gate === 'tristram' && canHost(l, ITEMS[staffPart], modes));
    const organ = pick(rng, keys.filter(k => k === 'qhr' || k === 'qey' || k === 'qbr'));
    placed.set(pick(rng, tristram).id, staffPart);
    placed.set('duriel', organ);
    keys = keys.filter(k => k !== staffPart && k !== organ);
  }

  // Assumed fill: place each key where it is reachable while holding every key not yet placed.
  for (let i = 0; i < keys.length; i++) {
    const item = ITEMS[keys[i]];
    const { spheres } = sweep(locs, placed, [...start, ...keys.slice(i + 1)], opts);
    const reach = new Set(spheres.flat());
    const candidates = locs.filter(l => reach.has(l.id) && !placed.has(l.id) && canHost(l, item, modes));
    if (!candidates.length) return null;
    placed.set(pick(rng, candidates).id, item.code);
  }

  // Fillers go into object slots only; every filler must find a home.
  for (const code of rng.shuffle(fillerItems())) {
    const item = ITEMS[code];
    const candidates = locs.filter(l => l.kind === 'object' && !placed.has(l.id) && canHost(l, item, modes));
    if (!candidates.length) return null;
    placed.set(pick(rng, candidates).id, code);
  }
  return placed;
}

/** Rules that make a beatable shuffle also an interesting one. */
export function interesting(placed: ReadonlyMap<LocationId, ItemCode>, opts: OpenActsOptions): boolean {
  const locs = new Map(activeLocations(opts).map(l => [l.id, l]));
  const where = new Map<ItemCode, PoolLocation>();
  for (const [id, item] of placed) where.set(item, locs.get(id)!);
  const keys = keyItems(opts);
  const moved = keys.filter(k => where.get(k)!.act !== ITEMS[k].vanillaAct).length;
  if (moved < Math.min(4, keys.length - 1)) return false;
  if (!keys.some(k => where.get(k)!.gate !== 'none')) return false;
  const staffInAct2 = where.get('msf')!.act === 2;
  if (opts.startWithCube ? staffInAct2 : staffInAct2 && where.get('box')!.act === 2) return false;
  // With bosses in the pool, insist on a two-step chain (a key behind a gate whose own key
  // is behind a gate, e.g. Tristram -> Staff of Kings -> Duriel -> Khalim's Heart), so the
  // seed has a real order to discover. Without bosses, Tristram is the only gate.
  if (opts.bossLocations) {
    const { spheres } = sweep(activeLocations(opts), placed, opts.startWithCube ? ['box'] : [], opts);
    let deepest = -1;
    spheres.forEach((ids, n) => {
      if (ids.some(id => { const item = placed.get(id); return item !== undefined && ITEMS[item].key; })) deepest = n;
    });
    if (deepest < 2) return false;
  }
  return true;
}

/** The shuffle can be finished: Duriel and Mephisto are both reachable from the start. */
export function beatable(placed: ReadonlyMap<LocationId, ItemCode>, opts: OpenActsOptions): boolean {
  const { owned } = sweep(activeLocations(opts), placed, opts.startWithCube ? ['box'] : [], opts);
  return gateOpen('duriel', owned) && goalReached(owned) && keyItems(opts).every(k => owned.has(k));
}

function vacantHandler(loc: ObjectLocation, modes: HostModes): number {
  if (loc.chest) return PLAIN_CHEST_HANDLER;
  // A non-chest host keeps a filler's handler (its own when its vanilla item is a filler).
  // A duplicate filler source is harmless: those handlers skip a player who has the item.
  const own = ITEMS[loc.vanilla];
  if (!own.key && canHost(loc, own, modes)) return own.handler;
  const filler = fillerItems().map(c => ITEMS[c]).find(i => canHost(loc, i, modes));
  if (!filler) throw new Error(`open-acts: no safe handler for vacant ${loc.objectClass}`);
  return filler.handler;
}

export function shuffleOpenActs(seed: number, opts: OpenActsOptions, modes: HostModes): OpenActsShuffle {
  const rng = createRNG(seed ^ OPEN_ACTS_RNG_TAG);
  for (let tries = 1; tries <= MAX_TRIES; tries++) {
    const placed = attempt(rng, opts, modes);
    if (!placed || !beatable(placed, opts) || !interesting(placed, opts)) continue;

    const locs = activeLocations(opts);
    const objectHandlers = new Map<string, number>();
    const bossDrops: OpenActsShuffle['bossDrops'] = [];
    for (const loc of locs) {
      const item = placed.get(loc.id);
      if (loc.kind === 'object') objectHandlers.set(loc.objectClass, item ? ITEMS[item].handler : vacantHandler(loc, modes));
      else if (item) bossDrops.push({ location: loc, item });
    }

    const { spheres } = sweep(locs, placed, opts.startWithCube ? ['box'] : [], opts);
    const sphereOf = new Map<LocationId, number>();
    spheres.forEach((ids, n) => ids.forEach(id => sphereOf.set(id, n)));
    const manifest: ManifestEntry[] = locs
      .filter(l => placed.has(l.id))
      .map(l => {
        const item = ITEMS[placed.get(l.id)!];
        return {
          item: item.code, itemName: item.name, key: item.key, location: l.id, locationName: l.name,
          act: l.act, kind: l.kind, sphere: sphereOf.get(l.id)!,
        };
      })
      .sort((a, b) => a.sphere - b.sphere || Number(b.key) - Number(a.key) || a.act - b.act);
    return { placements: placed, objectHandlers, bossDrops, manifest, tries };
  }
  throw new Error(`open-acts: no valid shuffle for seed ${seed} in ${MAX_TRIES} tries`);
}
