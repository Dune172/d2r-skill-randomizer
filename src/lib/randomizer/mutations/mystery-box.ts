/**
 * Mystery Box (slot 12) — disguise every skill in the tree.
 *
 * Unlike the stat-table mutations, this one acts outside MutationContext: it
 * forces a single shared icon (via an icon-assembler override) and blanks the
 * name / description / synergy-reference strings to "???". The route wires both
 * effects in directly; this module just holds the constant and the string edit.
 */

/** Universal icon every skill borrows. Any existing (class, IconCel) pair works —
 *  this is purely cosmetic and easy to swap. */
export const MYSTERY_ICON = { charclass: 'sor', iconCel: 0 } as const;

const MYSTERY = '???';

/**
 * Global skill-tooltip label strings for the Current / Next level stat headers.
 * The engine renders these regardless of descline content. An empty override
 * makes D2R fall back to the base-game text, so they're set to "???" (a visible
 * non-empty value) to mask the level block while leaving synergies readable.
 */
const LEVEL_LABEL_KEYS = new Set([
  'StrSkill1',              // "Next Level"
  'StrSkill2',              // "Current Skill Level: %d"
  'StrSkill117',            // "Current Skill Level: %d (item)"
  'TooltipSkillLevelBonus', // "Current Skill Level: %d (Base: %d)"
]);

/**
 * Overwrite the name / description / synergy-reference strings of every placed
 * skill to "???". Call AFTER writeSkillDescRows (so dsc3textb holds the final
 * synergy refs) and as the LAST edit to the string entries before serialization.
 */
export function applyMysteryStrings(
  skillDescHeaders: string[],
  skillDescRows: string[][],
  stringEntries: Record<string, unknown>[],
  placedSkilldescs: Set<string>,
): void {
  const cols = ['str name', 'str short', 'str long', 'str alt'];
  for (let i = 1; i <= 7; i++) cols.push(`dsc3textb${i}`);
  const idxs = cols.map(c => skillDescHeaders.indexOf(c)).filter(i => i !== -1);

  const keys = new Set<string>();
  for (const row of skillDescRows) {
    if (!placedSkilldescs.has(row[0])) continue; // only tree skills
    for (const idx of idxs) {
      const k = row[idx];
      if (k) keys.add(k);
    }
  }

  for (const entry of stringEntries) {
    const key = entry.Key as string;
    if (!keys.has(key) && !LEVEL_LABEL_KEYS.has(key)) continue;
    // Both skill name/desc strings and the Current/Next level header labels
    // become "???" so the only readable info left is the Synergies section.
    for (const field of Object.keys(entry)) {
      if (field === 'id' || field === 'Key') continue; // keep identity, blank all locales
      entry[field] = MYSTERY;
    }
  }
}

/**
 * Hide every detail line of a placed skill's tooltip — the Current/Next level
 * stat block AND the Synergies section — so nothing but the "???" name remains.
 * These are the skilldesc.txt display columns from `descdam` through the end of
 * the dsc3* synergy block (up to, but not including, `item proc text`).
 * skilldesc.txt is display-only, so clearing these columns has no gameplay effect.
 *
 * Call AFTER writeSkillDescRows and before skilldesc.txt is serialized.
 */
export function hideSkillDetailLines(
  skillDescHeaders: string[],
  skillDescRows: string[][],
  placedSkilldescs: Set<string>,
): void {
  const start = skillDescHeaders.indexOf('descdam');
  // Clear through the end of the dsc3 (synergy) block. Prefer the 'item proc
  // text' boundary; fall back to '*eol' so item-proc columns stay intact.
  let end = skillDescHeaders.indexOf('item proc text');
  if (end === -1) end = skillDescHeaders.indexOf('*eol');
  if (start === -1 || end === -1) return;

  for (const row of skillDescRows) {
    if (!placedSkilldescs.has(row[0])) continue;
    for (let i = start; i < end; i++) row[i] = '';
  }
}
