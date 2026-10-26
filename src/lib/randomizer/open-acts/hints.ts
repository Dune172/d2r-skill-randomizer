import type { ManifestEntry } from './fill';
import type { ItemCode } from './pool';

/**
 * Vague quest-log hints: each key item's act, never its exact spot. They replace the
 * vanilla lines that name the vanilla locations, which would be wrong after a shuffle.
 *
 * Act III's Khalim quest only shows once the player enters the Great Marsh, so the Den of
 * Evil line (visible from the start) also carries a summary of every hint.
 *
 * Quest-log text has no line breaks and stays under HINT_MAX_LENGTH characters, like the
 * vanilla lines (longest 173), so it fits above the Play Quest Dialogue button.
 */

export const HINT_MAX_LENGTH = 175;

const ACT_NAMES = { 1: 'Act I', 2: 'Act II', 3: 'Act III' } as const;

export interface QuestString {
  id: number;
  Key: string;
  enUS: string;
  [locale: string]: string | number;
}

function actOf(manifest: ManifestEntry[], code: ItemCode): string | null {
  const e = manifest.find(m => m.item === code);
  return e ? ACT_NAMES[e.act] : null;
}

/** English text for every quest-log key Open Acts rewrites. */
export function hintStrings(manifest: ManifestEntry[]): Record<string, string> {
  const at = (code: ItemCode) => actOf(manifest, code);
  const cube = at('box');
  const out: Record<string, string> = {};

  // One line, short enough for the quest log: it ignores line breaks (shown as '*'), and
  // text past about 175 characters runs under the Play Quest Dialogue button (seen in game).
  const summary = [
    `Scroll ${at('bks')}`,
    cube ? `Cube ${cube}` : null,
    `Staff ${at('msf')}`,
    `Eye ${at('qey')}`,
    `Brain ${at('qbr')}`,
    `Heart ${at('qhr')}`,
  ].filter(Boolean).join(', ');
  out.qstsa1q11 = `Look for the Den in the wilderness outside the Rogues' Camp. Relics: ${summary}.`;

  out.qstsa1q41 = `Search for the Scroll of Inifuss. It lies somewhere in ${at('bks')}.`;
  out.qstsa2q22 = [
    cube ? `The Horadric Cube is somewhere in ${cube}.` : null,
    `The Staff of Kings is somewhere in ${at('msf')}.`,
    'Search the Claw Viper Temple for the Amulet.',
  ].filter(Boolean).join(' ');
  out.qstsa3q21 = `Find Khalim's relics. His Eye is somewhere in ${at('qey')}.`;
  out.qstsa3q22 = `Khalim's Brain is somewhere in ${at('qbr')}.`;
  out.qstsa3q24 = `Khalim's Heart is somewhere in ${at('qhr')}.`;
  return out;
}

/**
 * Quest-log text for a shuffle played without hints. The vanilla lines name the vanilla
 * spots, which would now be wrong, so they say only what to look for.
 */
export function neutralStrings(startWithCube: boolean): Record<string, string> {
  return {
    qstsa1q41: 'Search for the Scroll of Inifuss. Its hiding place is unknown.',
    qstsa2q22: [
      startWithCube ? null : 'Find the Horadric Cube.',
      'Find the Staff of Kings.',
      'Search the Claw Viper Temple for the Amulet.',
    ].filter(Boolean).join(' '),
    qstsa3q21: "Find Khalim's relics. Their hiding places are unknown.",
    qstsa3q22: "Khalim's Brain lies hidden somewhere.",
    qstsa3q24: "Khalim's Heart lies hidden somewhere.",
  };
}

/**
 * Write the hints into the game's quests.json entries, in every locale. Other languages
 * get the English hint: a hint in English beats a vanilla line that names the wrong place.
 */
export function applyHints(entries: QuestString[], hints: Record<string, string>): void {
  const locales = Object.keys(entries[0] ?? {}).filter(k => k !== 'id' && k !== 'Key');
  for (const [key, text] of Object.entries(hints)) {
    const entry = entries.find(e => e.Key === key);
    if (!entry) throw new Error(`open-acts: quests.json has no ${key}`);
    for (const locale of locales) entry[locale] = text;
  }
}
