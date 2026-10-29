/**
 * Open Acts generator options, shared by the form, the Class Builder, share links,
 * /api/randomize and /api/download. Pure TypeScript (no Node APIs) so the browser can
 * import it.
 *
 *   shuffle   move the quest items (Inifuss scroll, Cube, Staff of Kings, Khalim's organs)
 *             around Acts I–III; works with or without open acts
 *   bosses    bosses can hold quest items            (only with shuffle; default on)
 *   hints     quest-log hints name each item's act   (only with shuffle; default on)
 *   spoiler   ship quest-shuffle.json with every spot (only with shuffle; default on,
 *             but off in Race Mode, which keeps spoilers hidden)
 *   acts      acts open from the start via starter characters: [], [2], [2, 3],
 *             [2, 3, 4] or [2, 3, 4, 5] (each act needs the ones before it)
 *   hardcore  starter characters are hardcore       (only with acts; default off)
 *   name      starter character name, '' for the class names (only with acts)
 *
 * Off (no shuffle, no acts) the generator output is byte-identical to before, and the
 * cache key gains nothing.
 */

export type OpenAct = 2 | 3 | 4 | 5;
export const OPEN_ACT_CHOICES: readonly OpenAct[] = [2, 3, 4, 5];

export interface OpenActsSettings {
  shuffle: boolean;
  bosses: boolean;
  hints: boolean;
  spoiler: boolean;
  acts: OpenAct[];
  hardcore: boolean;
  name: string;
}

export const DEFAULT_OPEN_ACTS: OpenActsSettings = {
  shuffle: false, bosses: true, hints: true, spoiler: true, acts: [], hardcore: false, name: '',
};

/** The spoiler file is on by default, except in Race Mode. */
export function defaultSpoiler(raceMode: boolean): boolean {
  return !raceMode;
}

/** D2R character names: 2–15 letters, at most one - or _, not at either end. */
export function isValidCharacterName(name: string): boolean {
  return /^[A-Za-z][A-Za-z_-]{0,13}[A-Za-z]$/.test(name) && (name.match(/[-_]/g) ?? []).length <= 1;
}

/** Acts [2..n] for the highest act picked: Act N starts open only with the acts before it. */
export function actLadder(highest: number): OpenAct[] {
  return OPEN_ACT_CHOICES.filter(a => a <= highest);
}

/** The pills act as a ladder: picking an act opens everything up to it, un-picking closes it and later acts. */
export function toggleActLadder(acts: readonly OpenAct[], act: OpenAct): OpenAct[] {
  return acts.includes(act) ? actLadder(act - 1) : actLadder(act);
}

/**
 * Clean up untrusted input. Acts form a ladder (Act II and III were proven in game
 * first; each later act needs the one before), and the flags that only apply with the
 * shuffle or with starters reset to their defaults otherwise, so equal settings always
 * produce equal cache keys. A spoiler choice that isn't given falls back to
 * defaultSpoiler(raceMode). An invalid name falls back to the class names.
 */
export function normalizeOpenActs(raw: unknown, raceMode = false): OpenActsSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const picked = Array.isArray(r.acts) ? r.acts.map(Number).filter(n => Number.isInteger(n)) : [];
  const acts = actLadder(Math.max(0, ...picked.filter(n => n >= 2 && n <= 5)));
  const shuffle = r.shuffle === true;
  const name = typeof r.name === 'string' ? r.name.trim() : '';
  return {
    shuffle,
    bosses: shuffle ? r.bosses !== false : true,
    hints: shuffle ? r.hints !== false : true,
    spoiler: shuffle && typeof r.spoiler === 'boolean' ? r.spoiler : defaultSpoiler(raceMode),
    acts,
    hardcore: acts.length > 0 && r.hardcore === true,
    name: acts.length > 0 && isValidCharacterName(name) ? name : '',
  };
}

const ACT_ROMAN = { 2: 'II', 3: 'III', 4: 'IV', 5: 'V' } as const;

/** "Act II", "Acts II and III", "Acts II, III and IV". */
export function openActsLabel(acts: readonly OpenAct[]): string {
  const r = acts.map(a => ACT_ROMAN[a]);
  if (r.length <= 1) return `Act ${r[0] ?? ''}`.trim();
  return `Acts ${r.slice(0, -1).join(', ')} and ${r[r.length - 1]}`;
}

export function openActsActive(s: OpenActsSettings): boolean {
  return s.shuffle || s.acts.length > 0;
}

/** Short class tags for starter names when one name is shared by several classes. */
const CLASS_TAGS: Record<string, string> = {
  Amazon: 'Ama', Sorceress: 'Sorc', Necromancer: 'Necro', Paladin: 'Pala',
  Barbarian: 'Barb', Druid: 'Druid', Assassin: 'Sin', Warlock: 'Lock',
};

/**
 * Name of one starter character. Without a custom name it is the class name. With one,
 * a single starter (Race Mode) uses it as typed; several get a class tag so the save
 * files don't collide (e.g. Swanny-Sorc). The base is shortened to stay within 15
 * letters, and the tag joins without a separator when the base already has one.
 */
export function starterName(base: string, className: string, single: boolean): string {
  if (!base || !isValidCharacterName(base)) return className;
  if (single) return base;
  const tag = CLASS_TAGS[className] ?? className.slice(0, 4);
  const sep = /[-_]/.test(base) ? '' : '-';
  let head = base.slice(0, 15 - tag.length - sep.length).replace(/[-_]+$/, '');
  if (head.length < 1) head = base.slice(0, 1);
  const name = `${head}${sep}${tag}`;
  return isValidCharacterName(name) ? name : className;
}

/**
 * Save folder of a mod with open acts. Starter characters are built for one seed, so they
 * get a folder of their own (Race Mode keeps its per-class name in front).
 */
export function openActsSavepath(modName: string, raceClassCode: string | null): string {
  return `${modName}${raceClassCode ?? ''}_openacts`;
}

/**
 * Suffix for the ZIP cache key; empty when Open Acts is off, so existing keys don't change.
 * Hardcore and the name are only added when set, so keys from before they existed still match.
 */
export function openActsCacheSegment(s: OpenActsSettings): string {
  if (!openActsActive(s)) return '';
  const flags = s.shuffle ? `s${s.bosses ? 'b' : ''}${s.hints ? 'h' : ''}${s.spoiler ? 'p' : ''}` : '-';
  return `:open-acts-v1:${flags}:a${s.acts.join('')}${s.hardcore ? ':hc' : ''}${s.name ? `:n${s.name}` : ''}`;
}

/** Share-link params, written only when they differ from the defaults. */
export function openActsToParams(s: OpenActsSettings, raceMode = false): string {
  let q = '';
  if (s.shuffle) {
    q += '&shuffleQuests=1';
    if (!s.bosses) q += '&questBosses=0';
    if (!s.hints) q += '&questHints=0';
    if (s.spoiler !== defaultSpoiler(raceMode)) q += `&questSpoiler=${s.spoiler ? 1 : 0}`;
  }
  if (s.acts.length) q += `&openActs=${s.acts.join(',')}`;
  if (s.hardcore) q += '&starterHc=1';
  if (s.name) q += `&starterName=${encodeURIComponent(s.name)}`;
  return q;
}

/** Inverse of openActsToParams. Links without the params get the defaults (all off). */
export function openActsFromParams(get: (name: string) => string | null, raceMode = false): OpenActsSettings {
  const spoiler = get('questSpoiler');
  return normalizeOpenActs({
    shuffle: get('shuffleQuests') === '1',
    bosses: get('questBosses') !== '0',
    hints: get('questHints') !== '0',
    spoiler: spoiler === null ? undefined : spoiler === '1',
    acts: (get('openActs') ?? '').split(',').filter(Boolean),
    hardcore: get('starterHc') === '1',
    name: get('starterName') ?? '',
  }, raceMode);
}

/** Feature keys counted for usage stats (see feature-stats.ts). Empty when Open Acts is off. */
export function openActsFeatureKeys(s: OpenActsSettings, ctx: { raceMode: boolean; classBuild: boolean }): string[] {
  if (!openActsActive(s)) return [];
  return [
    'open-acts',
    s.shuffle && 'open-acts:shuffle',
    s.shuffle && !s.bosses && 'open-acts:no-bosses',
    s.shuffle && !s.hints && 'open-acts:no-hints',
    s.shuffle && s.spoiler && 'open-acts:spoiler',
    s.acts.length > 0 && `open-acts:acts-to-${s.acts[s.acts.length - 1]}`,
    s.hardcore && 'open-acts:hardcore',
    s.name !== '' && 'open-acts:custom-name',
    ctx.raceMode && 'open-acts:race',
    ctx.classBuild && 'open-acts:class-builder',
  ].filter((k): k is string => typeof k === 'string' && k !== '');
}
