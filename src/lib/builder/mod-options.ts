/**
 * The game options a Class Builder build can carry, and how they travel: in the
 * /api/randomize body, the /api/download query and the share link.
 *
 * Race Mode and Forgotten Arts are absent on purpose — both routes force them
 * off for builds (Race Mode's Prayer filler would erase the hand-built class).
 */
export interface ModOptions {
  enablePrereqs: boolean;
  playersEnabled: boolean;
  playersCount: number;
  playersActs: number[];
  startingItems: {
    teleportStaff: boolean;
    teleportStaffLevel: number;
    teleportStaffDropSource: string;
    teleportStaffSpeed: boolean;
    horadricCube: boolean;
  };
  hirelingAura: boolean;
  disableChat: boolean;
  xpMultiplier: number;
  xpActs: number[];
  xpDifficulties: number[];
  enemyShuffle: boolean;
}

export const DEFAULT_MOD_OPTIONS: ModOptions = {
  enablePrereqs: true,
  playersEnabled: false,
  playersCount: 1,
  playersActs: [1, 2, 3, 4, 5],
  startingItems: {
    teleportStaff: false,
    teleportStaffLevel: 1,
    teleportStaffDropSource: 'Corpsefire',
    teleportStaffSpeed: true,
    horadricCube: false,
  },
  hirelingAura: true,
  disableChat: false,
  xpMultiplier: 1,
  xpActs: [1, 2, 3, 4, 5],
  xpDifficulties: [1, 2, 3],
  enemyShuffle: false,
};

const sorted = (list: number[]) => [...list].sort((a, b) => a - b).join(',');

/**
 * Option params for /api/download and the share link.
 *
 * THIS IS THE CACHE-KEY CONTRACT: /api/download rebuilds makeCacheKey() from
 * these params and 404s if it differs by one character from what
 * /api/randomize stored. Each omission mirrors the route's "effective value"
 * normalization — acts only with players > 1, xp acts/difficulties only with
 * a boost, staff params only with the staff — exactly as RandomizerApp's
 * buildQueryParams does for seeds.
 */
export function optionParams(opts: ModOptions): string {
  const multiplayer = opts.playersEnabled && opts.playersCount > 1;
  const boosted = opts.xpMultiplier > 1;
  const staff = opts.startingItems;
  return [
    multiplayer && `players=${opts.playersCount}`,
    staff.teleportStaff && `teleportStaff=${staff.teleportStaffLevel}`,
    staff.teleportStaff && `dropSource=${encodeURIComponent(staff.teleportStaffDropSource)}`,
    staff.teleportStaff && !staff.teleportStaffSpeed && 'staffSpeed=0',
    staff.horadricCube && 'cube=1',
    multiplayer && `acts=${sorted(opts.playersActs)}`,
    !opts.enablePrereqs && 'noPrereqs=1',
    !opts.hirelingAura && 'hirelingAura=0',
    opts.disableChat && 'disableChat=1',
    boosted && `xpMultiplier=${opts.xpMultiplier}`,
    boosted && `xpActs=${sorted(opts.xpActs)}`,
    boosted && `xpDifficulties=${sorted(opts.xpDifficulties)}`,
    opts.enemyShuffle && 'enemyShuffle=1',
  ].filter(Boolean).map(p => `&${p}`).join('');
}

export const buildDownloadQuery = (code: string, opts: ModOptions) => `build=${code}${optionParams(opts)}`;
export const buildShareQuery = (code: string, opts: ModOptions) => `b=${code}${optionParams(opts)}`;

/** Inverse of optionParams; each default matches the routes' fallback for an absent param. */
export function parseModOptions(p: URLSearchParams): ModOptions {
  const playersCount = Math.min(8, Math.max(1, Number(p.get('players')) || 1));
  const staffLevel = Number(p.get('teleportStaff')) || 0;
  const list = (key: string, max: number, fallback: number[]) =>
    p.has(key) ? p.get(key)!.split(',').map(Number).filter(n => n >= 1 && n <= max) : fallback;
  return {
    enablePrereqs: p.get('noPrereqs') !== '1',
    playersEnabled: playersCount > 1,
    playersCount,
    playersActs: list('acts', 5, [1, 2, 3, 4, 5]),
    startingItems: {
      teleportStaff: staffLevel > 0,
      teleportStaffLevel: staffLevel || 1,
      teleportStaffDropSource: p.get('dropSource') || 'Corpsefire',
      teleportStaffSpeed: p.get('staffSpeed') !== '0',
      horadricCube: p.get('cube') === '1',
    },
    hirelingAura: p.get('hirelingAura') !== '0',
    disableChat: p.get('disableChat') === '1',
    xpMultiplier: Math.min(3, Math.max(1, Number(p.get('xpMultiplier')) || 1)),
    xpActs: list('xpActs', 5, [1, 2, 3, 4, 5]),
    xpDifficulties: list('xpDifficulties', 3, [1, 2, 3]),
    enemyShuffle: p.get('enemyShuffle') === '1',
  };
}

/** The /api/randomize body for a build with these options. */
export function buildRandomizeBody(code: string, opts: ModOptions): string {
  return JSON.stringify({
    classBuild: code,
    enablePrereqs: opts.enablePrereqs,
    playersEnabled: opts.playersEnabled,
    playersCount: opts.playersCount,
    playersActs: opts.playersActs,
    startingItems: opts.startingItems,
    hirelingAura: opts.hirelingAura,
    disableChat: opts.disableChat,
    xpMultiplier: opts.xpMultiplier,
    xpActs: opts.xpActs,
    xpDifficulties: opts.xpDifficulties,
    enemyShuffle: opts.enemyShuffle,
  });
}
