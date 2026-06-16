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

/**
 * Strip from EVERY monster's Skill1-8 any slot whose skill was substituted this
 * seed (its skills.txt row now holds a different skill's mechanics — see the
 * substitute logic in api/randomize/route.ts). Monsters resolve their skills by
 * name and perform them under a hardcoded monster sequence (Sk*mode, e.g.
 * seq_ancientwhirlwind / seq_durieljab / seq_swtigerfist); running a repurposed
 * row's foreign client/server funcs under that sequence crashes the game. This is
 * why fighting the Ancients (Korlic/Whirlwind), Duriel (Jab), or summoning the
 * Assassin's Shadow Warrior/Master could hard-crash on certain seeds.
 *
 * Doing this monster-side keeps player skill trees byte-identical to vanilla
 * generation — placement and the coin-flip/substitute RNG are untouched, so a
 * given seed produces the exact same trees; only the affected monster rows lose a
 * skill. A monster whose only listed skill was substituted simply falls back to
 * its basic attack on that seed.
 *
 * Only substituted skills are removed: a skill that kept its coin flip (or was
 * dropped without a substitute) still has real, monster-castable mechanics and is
 * left in place. Surviving slots are compacted into Skill1..N (no empty slot
 * before a filled one) and trailing slots blanked, preserving the column count.
 */
export function stripSubstitutedMonsterSkills(
  headers: string[],
  rows: string[][],
  substitutedSkillNames: ReadonlySet<string>,
): string[][] {
  if (substitutedSkillNames.size === 0) return rows;

  // Each skill occupies a (Skill{i}, Sk{i}mode, Sk{i}lvl) triple.
  const slots: { skill: number; mode: number; lvl: number }[] = [];
  for (let i = 1; i <= 8; i++) {
    const skill = headers.indexOf(`Skill${i}`);
    const mode = headers.indexOf(`Sk${i}mode`);
    const lvl = headers.indexOf(`Sk${i}lvl`);
    if (skill !== -1 && mode !== -1 && lvl !== -1) slots.push({ skill, mode, lvl });
  }
  if (slots.length === 0) return rows;

  return rows.map(row => {
    // Collect surviving (skill, mode, lvl) triples in order, dropping substituted ones.
    const survivors: [string, string, string][] = [];
    let removed = false;
    for (const s of slots) {
      const name = row[s.skill]?.trim();
      if (name && substitutedSkillNames.has(name)) { removed = true; continue; }
      if (name) survivors.push([row[s.skill], row[s.mode], row[s.lvl]]);
    }
    if (!removed) return row; // nothing removed — leave untouched

    const updated = [...row];
    slots.forEach((s, i) => {
      const triple = survivors[i];
      updated[s.skill] = triple ? triple[0] : '';
      updated[s.mode] = triple ? triple[1] : '';
      updated[s.lvl] = triple ? triple[2] : '';
    });
    return updated;
  });
}
