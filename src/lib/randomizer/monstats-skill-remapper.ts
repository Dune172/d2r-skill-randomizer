/**
 * Remap numeric skill IDs in monstats.txt Skill1–8 columns.
 *
 * Required after reorderSkillsRows() physically moves skill rows in skills.txt:
 * the engine resolves monster skills by row position, so any stored numeric ID
 * that was shifted must be updated to its new position.
 *
 * Skill IDs not present in idMapping (non-class skills that didn't move) are
 * left unchanged.
 */
export function remapMonstatsSkillIds(
  headers: string[],
  rows: string[][],
  idMapping: Map<number, number>,
): string[][] {
  const skillCols: number[] = [];
  for (let i = 1; i <= 8; i++) {
    const idx = headers.indexOf(`Skill${i}`);
    if (idx !== -1) skillCols.push(idx);
  }
  if (skillCols.length === 0) return rows;

  return rows.map(row => {
    const updated = [...row];
    for (const col of skillCols) {
      const val = updated[col]?.trim();
      if (!val) continue;
      const id = parseInt(val, 10);
      if (isNaN(id)) continue;
      const newId = idMapping.get(id);
      if (newId !== undefined) updated[col] = String(newId);
    }
    return updated;
  });
}
