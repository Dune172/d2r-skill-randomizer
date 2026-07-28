import { SkillPlacement } from './types';

/**
 * Modify skilldesc.txt rows based on placements:
 * - Update SkillPage (tab index + 1)
 * - Update SkillRow and SkillColumn
 * - Update IconCel
 * - Update dsc3textb synergy references
 *
 * All column indices are resolved dynamically from headers.
 */
export function writeSkillDescRows(
  headers: string[],
  rows: string[][],
  placements: SkillPlacement[],
  // skill name → (original dsc3textb str name → replacement str name)
  descSynergyUpdates: Map<string, Map<string, string>>,
): void {
  // Build lookup: skilldesc name → placement
  const skilldescToPlacement = new Map<string, SkillPlacement>();
  for (const p of placements) {
    if (p.skill.skilldesc) {
      skilldescToPlacement.set(p.skill.skilldesc, p);
    }
  }

  // Resolve all column indices dynamically from headers
  const skillPageIdx = headers.indexOf('SkillPage');
  const skillRowIdx = headers.indexOf('SkillRow');
  const skillColIdx = headers.indexOf('SkillColumn');
  const iconCelIdx = headers.indexOf('IconCel');
  const listRowIdx = headers.indexOf('ListRow');

  // Build dsc3 column index arrays dynamically
  const dsc3LineIdx: number[] = [];
  const dsc3TextaIdx: number[] = [];
  const dsc3TextbIdx: number[] = [];
  const dsc3CalcaIdx: number[] = [];
  const dsc3CalcbIdx: number[] = [];

  for (let i = 1; i <= 7; i++) {
    dsc3LineIdx.push(headers.indexOf(`dsc3line${i}`));
    dsc3TextaIdx.push(headers.indexOf(`dsc3texta${i}`));
    dsc3TextbIdx.push(headers.indexOf(`dsc3textb${i}`));
    dsc3CalcaIdx.push(headers.indexOf(`dsc3calca${i}`));
    dsc3CalcbIdx.push(headers.indexOf(`dsc3calcb${i}`));
  }

  for (const row of rows) {
    const skilldescName = row[0]; // skilldesc column is always first
    const placement = skilldescToPlacement.get(skilldescName);
    if (!placement) continue;

    // SkillPage = tab index + 1 (1-based)
    if (skillPageIdx >= 0) row[skillPageIdx] = String(placement.tabIndex + 1);

    // SkillRow and SkillColumn from grid position
    if (skillRowIdx >= 0) row[skillRowIdx] = String(placement.row);
    if (skillColIdx >= 0) row[skillColIdx] = String(placement.col);

    // ListRow = which skill tree tab (1=tree1, 2=tree2, 3=tree3).
    // Per the D2R Data Guide, valid values are 0-3; values >3 make the skill
    // invisible in the Skill Selection UI (action bar assignment list).
    // ListRow must equal SkillPage (both represent the tab number).
    if (listRowIdx >= 0) row[listRowIdx] = String(placement.tabIndex + 1);

    // IconCel = new icon index
    if (iconCelIdx >= 0) row[iconCelIdx] = String(placement.iconCel);

    // Update dsc3textb synergy references (preserve original line/texta).
    // The dsc3calca/calcb formulas are rewritten upstream by
    // updateSkillsSynergies, which remaps every skill('X'.blvl|.lvl) ref in
    // this row alongside the skills.txt row.
    //
    // Each slot is looked up by the skill it originally named, so the name on
    // a line always matches the skill driving that line's calc — not by slot
    // position, which mismatched them whenever formula order differed from
    // dsc3 order.
    const synergyMap = descSynergyUpdates.get(placement.skill.skill);
    if (synergyMap) {
      for (let i = 0; i < 7; i++) {
        if (dsc3TextbIdx[i] < 0 || dsc3TextbIdx[i] >= row.length) continue;
        // Skip line type "40" (header: "X receives bonuses from:") — textb1 is a self-reference.
        if (dsc3LineIdx[i] >= 0 && row[dsc3LineIdx[i]] === '40') continue;
        const origTextB = row[dsc3TextbIdx[i]];
        if (!origTextB) continue;
        const replacement = synergyMap.get(origTextB);
        if (replacement) row[dsc3TextbIdx[i]] = replacement;
      }
    }
  }
}
