/**
 * Open Acts generator options, shared by the form, share links, /api/randomize and
 * /api/download. Pure TypeScript (no Node APIs) so the browser can import it.
 *
 *   shuffle  move the quest items (Inifuss scroll, Cube, Staff of Kings, Khalim's organs)
 *            around Acts I–III; works with or without open acts
 *   bosses   bosses can hold quest items            (only with shuffle; default on)
 *   hints    quest-log hints name each item's act   (only with shuffle; default on)
 *   spoiler  ship quest-shuffle.json with every spot (only with shuffle; default on)
 *   acts     acts open from the start via starter characters: [], [2] or [2, 3]
 *
 * Off (no shuffle, no acts) the generator output is byte-identical to before, and the
 * cache key gains nothing.
 */

export type OpenAct = 2 | 3;

export interface OpenActsSettings {
  shuffle: boolean;
  bosses: boolean;
  hints: boolean;
  spoiler: boolean;
  acts: OpenAct[];
}

export const DEFAULT_OPEN_ACTS: OpenActsSettings = {
  shuffle: false, bosses: true, hints: true, spoiler: true, acts: [],
};

/**
 * Clean up untrusted input. Act III needs Act II (the starter save's act flags were
 * proven in that combination), and the shuffle-only flags reset to their defaults when
 * there is no shuffle, so equal settings always produce equal cache keys.
 */
export function normalizeOpenActs(raw: unknown): OpenActsSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const picked = Array.isArray(r.acts) ? r.acts.map(Number) : [];
  const acts: OpenAct[] = picked.includes(3) ? [2, 3] : picked.includes(2) ? [2] : [];
  const shuffle = r.shuffle === true;
  return {
    shuffle,
    bosses: shuffle ? r.bosses !== false : true,
    hints: shuffle ? r.hints !== false : true,
    spoiler: shuffle ? r.spoiler !== false : true,
    acts,
  };
}

export function openActsActive(s: OpenActsSettings): boolean {
  return s.shuffle || s.acts.length > 0;
}

/**
 * Save folder of a mod with open acts. Starter characters are built for one seed, so they
 * get a folder of their own (Race Mode keeps its per-class name in front).
 */
export function openActsSavepath(modName: string, raceClassCode: string | null): string {
  return `${modName}${raceClassCode ?? ''}_openacts`;
}

/** Suffix for the ZIP cache key; empty when Open Acts is off, so existing keys don't change. */
export function openActsCacheSegment(s: OpenActsSettings): string {
  if (!openActsActive(s)) return '';
  const flags = s.shuffle ? `s${s.bosses ? 'b' : ''}${s.hints ? 'h' : ''}${s.spoiler ? 'p' : ''}` : '-';
  return `:open-acts-v1:${flags}:a${s.acts.join('')}`;
}

/** Share-link params, written only when they differ from the defaults. */
export function openActsToParams(s: OpenActsSettings): string {
  let q = '';
  if (s.shuffle) {
    q += '&shuffleQuests=1';
    if (!s.bosses) q += '&questBosses=0';
    if (!s.hints) q += '&questHints=0';
    if (!s.spoiler) q += '&questSpoiler=0';
  }
  if (s.acts.length) q += `&openActs=${s.acts.join(',')}`;
  return q;
}

/** Inverse of openActsToParams. Links without the params get the defaults (all off). */
export function openActsFromParams(get: (name: string) => string | null): OpenActsSettings {
  return normalizeOpenActs({
    shuffle: get('shuffleQuests') === '1',
    bosses: get('questBosses') !== '0',
    hints: get('questHints') !== '0',
    spoiler: get('questSpoiler') !== '0',
    acts: (get('openActs') ?? '').split(',').filter(Boolean),
  });
}
