import { ClassCode, SkillPlacement } from './types';

/**
 * Static map of D2R base item codes → class restriction.
 *
 * Sources:
 *   - Vanilla class-restricted types from Official/itemtypes.txt (pelt→dru, head→nec,
 *     phlm→bar, ashd→pal, orb→sor, abow/ajav/aspe→ama, h2h/h2h2→ass)
 *   - Custom warlock grimoire codes (wa6, wac, wae, waf) present only in this mod's
 *     uniqueitems.txt — not in Official weapons/armor data.
 */
const ITEM_CLASS_MAP: Map<string, ClassCode> = new Map([
  // Druid pelts (dr1–drf)
  ...(['dr1','dr2','dr3','dr4','dr5','dr6','dr7','dr8','dr9','dra','drb','drc','drd','dre','drf'] as const)
    .map((c): [string, ClassCode] => [c, 'dru']),
  // Necromancer shrunken heads (ne1–nef)
  ...(['ne1','ne2','ne3','ne4','ne5','ne6','ne7','ne8','ne9','nea','neb','neg','ned','nee','nef'] as const)
    .map((c): [string, ClassCode] => [c, 'nec']),
  // Barbarian primal helms (ba1–baf)
  ...(['ba1','ba2','ba3','ba4','ba5','ba6','ba7','ba8','ba9','baa','bab','bac','bad','bae','baf'] as const)
    .map((c): [string, ClassCode] => [c, 'bar']),
  // Paladin auric shields (pa1–paf)
  ...(['pa1','pa2','pa3','pa4','pa5','pa6','pa7','pa8','pa9','paa','pab','pac','pad','pae','paf'] as const)
    .map((c): [string, ClassCode] => [c, 'pal']),
  // Sorceress orbs (ob1–obf)
  ...(['ob1','ob2','ob3','ob4','ob5','ob6','ob7','ob8','ob9','oba','obb','obc','obd','obe','obf'] as const)
    .map((c): [string, ClassCode] => [c, 'sor']),
  // Amazon weapons — bows, javelins, spears (am1–amf)
  ...(['am1','am2','am3','am4','am5','am6','am7','am8','am9','ama','amb','amc','amd','ame','amf'] as const)
    .map((c): [string, ClassCode] => [c, 'ama']),
  // Assassin claws — h2h and h2h2 types
  ...(['ktr','wrb','axf','ces','clw','btl','skr','9ar','9wb','9xf','9cs','9lw','9tw','9qr',
       '7ar','7wb','7xf','7cs','7lw','7tw','7qr'] as const)
    .map((c): [string, ClassCode] => [c, 'ass']),
  // Warlock grimoires — custom codes in this mod (not in Official item data)
  ['wa6', 'war'],
  ['wac', 'war'],
  ['wae', 'war'],
  ['waf', 'war'],
]);

/**
 * Remap class-restricted `skill` and `charged` prop params in uniqueitems.txt.
 *
 * uniqueitems.txt differs from magicprefix/magicsuffix in two ways:
 *   1. No `class` column — class restriction is derived from the item's base `code` via ITEM_CLASS_MAP.
 *   2. Uses `prop*`/`par*` columns (not `mod*code`/`mod*param`).
 *      `skill` params may be numeric IDs (vanilla items) OR skill name strings (custom items).
 *      `charged` params are always numeric IDs.
 *
 * Remapping strategy (same grid-position logic as remapClassItemSkills):
 *   For each row whose `code` maps to a class restriction:
 *   1. Find placement P for the original skill (by ID or by name)
 *   2. Look up placement Q at the same (tabIndex, row, col) in the restricted class
 *   3. Write Q's skill ID (numeric props) or name (string props) back into par*
 *
 * `skilltab` entries are intentionally left unchanged.
 */
export function remapUniqueItemSkills(
  headers: string[],
  rows: string[][],
  placements: SkillPlacement[],
  idMapping?: Map<number, number>,
): string[][] {
  const byName = new Map<string, SkillPlacement>(placements.map(p => [p.skill.skill, p]));
  const byId = new Map<number, SkillPlacement>(placements.map(p => [p.skill.id, p]));
  const byPos = new Map<string, SkillPlacement>(
    placements.map(p => [`${p.targetClass}_${p.tabIndex}_${p.row}_${p.col}`, p]),
  );
  // Fallback 1: same class + same (row, col), any tab — first match wins
  const byClassRowCol = new Map<string, SkillPlacement>();
  for (const p of placements) {
    const k = `${p.targetClass}_${p.row}_${p.col}`;
    if (!byClassRowCol.has(k)) byClassRowCol.set(k, p);
  }
  // Fallback 2: same class + same row, any col/tab — first match wins
  const byClassRow = new Map<string, SkillPlacement>();
  for (const p of placements) {
    const k = `${p.targetClass}_${p.row}`;
    if (!byClassRow.has(k)) byClassRow.set(k, p);
  }

  const codeCol = headers.indexOf('code');
  if (codeCol === -1) return rows;

  return rows.map(row => {
    const itemCode = row[codeCol]?.trim();
    if (!itemCode) return row;

    const classRestriction = ITEM_CLASS_MAP.get(itemCode);
    if (!classRestriction) return row;

    const updated = [...row];
    for (let slot = 1; slot <= 12; slot++) {
      const propCol = headers.indexOf(`prop${slot}`);
      const parCol = headers.indexOf(`par${slot}`);
      if (propCol === -1 || parCol === -1) continue;

      const prop = updated[propCol];
      const par = updated[parCol];
      if (!par?.trim()) continue;

      let srcPlacement: SkillPlacement | undefined;
      let useNumeric: boolean;

      if (prop === 'skill') {
        const numId = parseInt(par.trim(), 10);
        if (!isNaN(numId)) {
          srcPlacement = byId.get(numId);
          useNumeric = true;
        } else {
          srcPlacement = byName.get(par.trim());
          useNumeric = false;
        }
      } else if (prop === 'charged') {
        const id = parseInt(par.trim(), 10);
        if (!isNaN(id)) srcPlacement = byId.get(id);
        useNumeric = true;
      } else {
        continue;
      }

      if (!srcPlacement) continue;

      const destPlacement =
        byPos.get(`${classRestriction}_${srcPlacement.tabIndex}_${srcPlacement.row}_${srcPlacement.col}`) ??
        byClassRowCol.get(`${classRestriction}_${srcPlacement.row}_${srcPlacement.col}`) ??
        byClassRow.get(`${classRestriction}_${srcPlacement.row}`);
      if (!destPlacement) continue;

      updated[parCol] = useNumeric
        ? String(idMapping?.get(destPlacement.skill.id) ?? destPlacement.skill.id)
        : destPlacement.skill.skill;
    }
    return updated;
  });
}

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
  idMapping?: Map<number, number>,
): string[][] {
  // Build lookup: skillName → placement
  const byName = new Map<string, SkillPlacement>(placements.map(p => [p.skill.skill, p]));
  // Build lookup: skillId → placement
  const byId = new Map<number, SkillPlacement>(placements.map(p => [p.skill.id, p]));
  // Build position lookup: "targetClass_tabIndex_row_col" → placement
  const byPos = new Map<string, SkillPlacement>(
    placements.map(p => [`${p.targetClass}_${p.tabIndex}_${p.row}_${p.col}`, p]),
  );
  // Fallback 1: same class + same (row, col), any tab — first match wins
  const byClassRowCol = new Map<string, SkillPlacement>();
  for (const p of placements) {
    const k = `${p.targetClass}_${p.row}_${p.col}`;
    if (!byClassRowCol.has(k)) byClassRowCol.set(k, p);
  }
  // Fallback 2: same class + same row, any col/tab — first match wins
  const byClassRow = new Map<string, SkillPlacement>();
  for (const p of placements) {
    const k = `${p.targetClass}_${p.row}`;
    if (!byClassRow.has(k)) byClassRow.set(k, p);
  }

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

      const destPlacement =
        byPos.get(`${classRestriction}_${srcPlacement.tabIndex}_${srcPlacement.row}_${srcPlacement.col}`) ??
        byClassRowCol.get(`${classRestriction}_${srcPlacement.row}_${srcPlacement.col}`) ??
        byClassRow.get(`${classRestriction}_${srcPlacement.row}`);
      if (!destPlacement) continue;

      updated[paramCol] = code === 'skill'
        ? destPlacement.skill.skill
        : String(idMapping?.get(destPlacement.skill.id) ?? destPlacement.skill.id);
    }
    return updated;
  });
}
