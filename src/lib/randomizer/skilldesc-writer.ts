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
  descSynergyUpdates: Map<string, string[]>, // skill name → new dsc3textb str name values
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

    // ListRow = position within tab (1-based sequential)
    if (listRowIdx >= 0) row[listRowIdx] = String(placement.skillIndex % 10 + 1);

    // IconCel = new icon index
    if (iconCelIdx >= 0) row[iconCelIdx] = String(placement.iconCel);

    // Update dsc3textb synergy references
    const newTextBs = descSynergyUpdates.get(placement.skill.skill);
    if (newTextBs) {
      // Clear all dsc3 slots first
      for (let i = 0; i < 7; i++) {
        if (dsc3LineIdx[i] >= 0 && dsc3LineIdx[i] < row.length) row[dsc3LineIdx[i]] = '';
        if (dsc3TextaIdx[i] >= 0 && dsc3TextaIdx[i] < row.length) row[dsc3TextaIdx[i]] = '';
        if (dsc3TextbIdx[i] >= 0 && dsc3TextbIdx[i] < row.length) row[dsc3TextbIdx[i]] = '';
        if (dsc3CalcaIdx[i] >= 0 && dsc3CalcaIdx[i] < row.length) row[dsc3CalcaIdx[i]] = '';
        if (dsc3CalcbIdx[i] >= 0 && dsc3CalcbIdx[i] < row.length) row[dsc3CalcbIdx[i]] = '';
      }

      // Fill in synergy header
      if (newTextBs.length > 0 && dsc3LineIdx[0] >= 0) {
        row[dsc3LineIdx[0]] = '40';
        row[dsc3TextaIdx[0]] = 'Sksyn';
        row[dsc3TextbIdx[0]] = newTextBs[0];
        row[dsc3CalcaIdx[0]] = '2';
      }

      // Fill remaining synergy entries
      for (let i = 1; i < newTextBs.length && i < 7; i++) {
        if (dsc3LineIdx[i] >= 0) {
          row[dsc3LineIdx[i]] = '76';
          row[dsc3TextaIdx[i]] = 'Magdplev';
          row[dsc3TextbIdx[i]] = newTextBs[i];
          row[dsc3CalcaIdx[i]] = 'par8';
        }
      }
    }
  }
}
