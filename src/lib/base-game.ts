/**
 * The base-game option: a mod for players who don't own Reign of the Warlock.
 *
 * D2R keeps two sets of game tables. Reign of the Warlock games read
 * data/global/excel/; Classic and Lord of Destruction games read
 * data/global/excel/base/. Without the DLC a player only has the second kind, so a
 * normal mod's tables are never loaded and they see shuffled tree art over vanilla
 * skills. A base-game mod is built from the base tables (data/txt/base/), writes them
 * to excel/base/, and leaves the Warlock out (they can't play it, and the base tables
 * have no Warlock skill descriptions).
 *
 * It is the plain randomizer only: challenges, mutations, Open Acts and Archipelago
 * stay Reign of the Warlock. Off adds nothing to any request, share link or cache key,
 * so every existing mod stays byte-for-byte the same.
 *
 * Browser-safe: the forms and routes share these.
 */

/** From an /api/randomize body: only an explicit true turns it on. */
export function normalizeBaseGame(body: { baseGame?: unknown } | null | undefined): boolean {
  return body?.baseGame === true;
}

/** From a query string (/api/download, share links). */
export function baseGameFromParams(get: (name: string) => string | null): boolean {
  return get('baseGame') === '1';
}

/** Query params without leading '&', the default omitted. */
export function baseGameParams(baseGame: boolean): string[] {
  return baseGame ? ['baseGame=1'] : [];
}

/** Cache-key segment: empty when off so every existing key is unchanged. */
export const baseGameCacheSegment = (baseGame: boolean): string => (baseGame ? ':base' : '');

export const baseGameFeatureKeys = (baseGame: boolean): string[] => (baseGame ? ['base-game'] : []);

/** seed123 → seed123base, so a base-game mod never shares a folder with the same seed's normal mod. */
export const baseGameModName = (modName: string, baseGame: boolean): string =>
  (baseGame ? `${modName}base` : modName);

/** Base-game characters get their own save folder (D2RRandomizer → D2RRandomizerBase). */
export const baseGameSavepath = (savepath: string, baseGame: boolean): string =>
  (baseGame ? `${savepath}Base` : savepath);

/**
 * Why the option can't be combined with another setting, or null when it can. The
 * forms grey the other setting out with this text; the routes refuse the request.
 */
export function baseGameConflict(o: {
  baseGame: boolean;
  openActs?: boolean;
  mutations?: number;
  warlockInBuild?: boolean;
}): string | null {
  if (!o.baseGame) return null;
  if (o.openActs) return 'Open Acts needs Reign of the Warlock: its starter characters were made in it.';
  if (o.mutations) return 'Mutations need Reign of the Warlock.';
  if (o.warlockInBuild) return 'The Warlock and its skills need Reign of the Warlock. Remove them from the build.';
  return null;
}

/** Extra README.txt lines in a base-game mod. */
export const BASE_GAME_README: readonly string[] = [
  '',
  'This mod is for Diablo II: Resurrected WITHOUT Reign of the Warlock.',
  'Play a non-expansion character (Classic or Lord of Destruction). The Warlock is left out.',
  'A character converted to Reign of the Warlock will not see the randomized skills.',
  '',
];
