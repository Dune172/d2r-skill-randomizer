import { SkillPlacement } from './types';

/**
 * Remap class-restricted `skill` and `charged` mod params in magic affix files.
 *
 * After the skill shuffle, class-specific item affixes (e.g. charged suffixes on
 * Amazon-restricted items) still reference original skill names / IDs that may no
 * longer belong to that class.  This function finds the skill now occupying the
 * same grid position in the restricted class and substitutes its name or ID.
 *
 * Remapping strategy:
 *   For each row with a non-empty `class` column and mod code `skill` or `charged`:
 *   1. Find placement P for the original skill (by name for `skill`, by ID for `charged`)
 *   2. P.tabIndex / P.row / P.col describe where that skill sits in its new class
 *   3. Find placement Q where Q.targetClass === classRestriction at the same (tab, row, col)
 *   4. Substitute Q's skill name (for `skill`) or numeric ID (for `charged`)
 *
 * `skilltab` entries (tree-wide bonuses) are intentionally left unchanged — they
 * reference tree-slot indices (e.g. 15/16/17 for druid) which remain class-bound
 * regardless of which skills fill the tree.
 */
export function remapClassItemSkills(
  headers: string[],
  rows: string[][],
  placements: SkillPlacement[],
): string[][] {
  // Build lookup: skillName → placement
  const byName = new Map<string, SkillPlacement>(placements.map(p => [p.skill.skill, p]));
  // Build lookup: skillId → placement
  const byId = new Map<number, SkillPlacement>(placements.map(p => [p.skill.id, p]));
  // Build position lookup: "targetClass_tabIndex_row_col" → placement
  const byPos = new Map<string, SkillPlacement>(
    placements.map(p => [`${p.targetClass}_${p.tabIndex}_${p.row}_${p.col}`, p]),
  );

  const classCol = headers.indexOf('class');
  if (classCol === -1) return rows;

  return rows.map(row => {
    const classRestriction = row[classCol]?.trim();
    if (!classRestriction) return row;

    const updated = [...row];
    for (let slot = 1; slot <= 3; slot++) {
      const codeCol = headers.indexOf(`mod${slot}code`);
      const paramCol = headers.indexOf(`mod${slot}param`);
      if (codeCol === -1 || paramCol === -1) continue;

      const code = updated[codeCol];
      const param = updated[paramCol];
      if (!param?.trim()) continue;

      let srcPlacement: SkillPlacement | undefined;
      if (code === 'skill') {
        srcPlacement = byName.get(param.trim());
      } else if (code === 'charged') {
        const id = parseInt(param.trim(), 10);
        if (!isNaN(id)) srcPlacement = byId.get(id);
      } else {
        continue;
      }

      if (!srcPlacement) continue;

      const key = `${classRestriction}_${srcPlacement.tabIndex}_${srcPlacement.row}_${srcPlacement.col}`;
      const destPlacement = byPos.get(key);
      if (!destPlacement) continue;

      updated[paramCol] = code === 'skill'
        ? destPlacement.skill.skill
        : String(destPlacement.skill.id);
    }
    return updated;
  });
}
