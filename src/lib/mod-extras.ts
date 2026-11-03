/**
 * Two on/off mod options from the Discord requests (Generate page and Class Builder):
 *
 * - seasonal: ship the seasonal town decorations (src/lib/seasons). Off leaves the
 *   ~50 MB overlay out. It replaces vanilla town, foliage and lighting files, which
 *   is what clashes when a player merges the randomizer with another mod.
 * - anyClassItems: every class can equip class-only items (see openClassItems below).
 *
 * The defaults (seasonal on, class items off) add nothing to any request, share link or
 * cache key, so every existing mod stays byte-for-byte the same. Challenges and
 * Archipelago mods always use the defaults.
 *
 * Browser-safe: the forms and routes share these.
 */
export interface ModExtras {
  seasonal: boolean;
  anyClassItems: boolean;
}

export const DEFAULT_MOD_EXTRAS: ModExtras = { seasonal: true, anyClassItems: false };

/** From an /api/randomize body: anything but an explicit false/true is the default. */
export function normalizeModExtras(body: { seasonal?: unknown; anyClassItems?: unknown } | null | undefined): ModExtras {
  return { seasonal: body?.seasonal !== false, anyClassItems: body?.anyClassItems === true };
}

/** From a query string (/api/download, share links). */
export function modExtrasFromParams(get: (name: string) => string | null): ModExtras {
  return { seasonal: get('noSeason') !== '1', anyClassItems: get('classItems') === '1' };
}

/** Query params without leading '&', default values omitted. */
export function modExtrasParams(e: ModExtras): string[] {
  return [!e.seasonal && 'noSeason=1', e.anyClassItems && 'classItems=1'].filter((p): p is string => !!p);
}

/** Cache-key segment: empty at the defaults so every existing key is unchanged. */
export const modExtrasCacheSegment = (e: ModExtras): string =>
  `${e.seasonal ? '' : ':noseason'}${e.anyClassItems ? ':classitems' : ''}`;

export const modExtrasFeatureKeys = (e: ModExtras): string[] =>
  [!e.seasonal && 'no-season', e.anyClassItems && 'any-class-items'].filter((k): k is string => !!k);

/**
 * Item types whose class lock stays. Claws (h2h, h2h2) use the HT1/HT2 weapon
 * animations, which only the Assassin's character model has, so on any other
 * class an equipped claw would have no attack animation to play.
 */
export const CLASS_LOCKED_ITEM_TYPES: ReadonlySet<string> = new Set(['h2h', 'h2h2']);

/**
 * itemtypes.txt with the Class column cleared on every class-only type except claws:
 * orbs, voodoo heads, auric shields, primal helms, pelts, Amazon bows, spears and
 * javelins, cloaks and grimoires, plus the parent "<Class> Item" types they inherit
 * from. Their skill bonuses still name the class they belong to (as on any item).
 */
export function openClassItems(itemtypesTxt: string): string {
  const eol = itemtypesTxt.includes('\r\n') ? '\r\n' : '\n';
  const lines = itemtypesTxt.split(eol);
  const headers = lines[0].split('\t');
  const codeCol = headers.indexOf('Code');
  const classCol = headers.indexOf('Class');
  if (codeCol === -1 || classCol === -1) throw new Error('itemtypes.txt has no Code/Class column');
  let opened = 0;
  const out = lines.map((line, i) => {
    if (i === 0 || !line) return line;
    const cols = line.split('\t');
    if (!cols[classCol] || CLASS_LOCKED_ITEM_TYPES.has(cols[codeCol])) return line;
    cols[classCol] = '';
    opened++;
    return cols.join('\t');
  });
  if (opened === 0) throw new Error('openClassItems: no class-only item types found');
  return out.join(eol);
}
