import { SkillPlacement } from './types';
import { StringEntry } from '../data-loader';
import { CLASS_NATURAL_WEAPON, CLASS_RESTRICTED_TYPES } from './config';

// Human-readable names and description phrases for each weapon type
const WEAPON_TYPE_INFO: Record<string, { name: string; text: string }> = {
  h2h:  { name: 'Claw',    text: 'claw class weapons' },
  mele: { name: 'Melee',   text: 'melee weapons' },
  miss: { name: 'Missile', text: 'missile weapons' },
  staf: { name: 'Staff',   text: 'staves' },
  wand: { name: 'Wand',    text: 'wands' },
  weap: { name: 'Weapon',  text: 'weapons' },
};

/**
 * Update skill name and description strings for any skill whose weapon-type
 * columns were remapped by Normal Logic.
 *
 * For each affected skill:
 * - Replaces the weapon type phrase in Skillsd / Skillld (descriptions)
 * - Replaces the weapon type name in Skillname / Skillan (displayed name)
 *
 * Looks up string keys via the skill's skilldesc → str name path
 * (e.g. "claw mastery" → "Skillname253" → keys 253 → Skillsd253, Skillld253, …)
 */
export function writeSkillStrings(
  entries: StringEntry[],
  skillDescStrNames: Map<string, string>,
  placements: SkillPlacement[],
): void {
  // Case-insensitive key index for fast lookup
  const entryByKey = new Map<string, StringEntry>();
  for (const e of entries) {
    entryByKey.set(e.Key.toLowerCase(), e);
  }

  const processed = new Set<string>();

  for (const p of placements) {
    const skill = p.skill;
    if (processed.has(skill.skill)) continue;

    const naturalWeapon = CLASS_NATURAL_WEAPON[p.targetClass];
    if (!naturalWeapon) continue;

    // Find the first class-restricted weapon type on this skill that needs remapping
    let oldType: string | undefined;
    for (const t of [skill.passiveitype, skill.itypea1, skill.itypea2, skill.itypea3]) {
      if (t && CLASS_RESTRICTED_TYPES.has(t) && t !== naturalWeapon) {
        oldType = t;
        break;
      }
    }
    if (!oldType) continue;

    const oldInfo = WEAPON_TYPE_INFO[oldType];
    const newInfo = WEAPON_TYPE_INFO[naturalWeapon];
    if (!oldInfo || !newInfo) continue;

    // Look up the str name key from skilldesc (e.g. "Skillname253")
    const strName = skillDescStrNames.get(skill.skilldesc);
    if (!strName) continue;

    // Extract the numeric suffix (e.g. "253")
    const numMatch = strName.match(/\d+$/);
    if (!numMatch) continue;
    const num = numMatch[0];

    // Process name, alt-name, short desc, and long desc keys
    for (const prefix of ['skillname', 'skillan', 'skillsd', 'skillld']) {
      const entry = entryByKey.get(`${prefix}${num}`);
      if (!entry || !entry.enUS) continue;

      let text = entry.enUS as string;

      // Replace the full weapon-type phrase first (longer match → less ambiguity)
      text = text.split(oldInfo.text).join(newInfo.text);

      // For name/alt-name: also replace the bare capitalized weapon word
      // e.g. "Claw Mastery" → "Melee Mastery"
      if (prefix === 'skillname' || prefix === 'skillan') {
        text = text.replace(new RegExp(`\\b${oldInfo.name}\\b`, 'g'), newInfo.name);
      }

      entry.enUS = text;
    }

    processed.add(skill.skill);
  }
}
