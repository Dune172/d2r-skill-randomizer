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
    if (!keys.has(entry.Key as string)) continue;
    for (const field of Object.keys(entry)) {
      if (field === 'id' || field === 'Key') continue; // keep identity, blank all locales
      entry[field] = MYSTERY;
    }
  }
}
