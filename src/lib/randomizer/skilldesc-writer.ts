import { SkillPlacement } from './types';

// Column indices in skilldesc.txt (0-based)
const COL = {
  skilldesc: 0,
  SkillPage: 1,
  SkillRow: 2,
  SkillColumn: 3,
  ListRow: 4,
  IconCel: 5,
  strName: 6,
};

// dsc3textb columns at indices 83, 88, 93, 98, 103, 108, 113
const DSC3_TEXTB_INDICES = [83, 88, 93, 98, 103, 108, 113];
// dsc3texta columns (preceding textb by 1)
const DSC3_TEXTA_INDICES = [82, 87, 92, 97, 102, 107, 112];
// dsc3line columns (preceding texta by 1)
const DSC3_LINE_INDICES = [81, 86, 91, 96, 101, 106, 111];
// dsc3calca columns (following textb by 1)
const DSC3_CALCA_INDICES = [84, 89, 94, 99, 104, 109, 114];
// dsc3calcb columns (following calca by 1)
const DSC3_CALCB_INDICES = [85, 90, 95, 100, 105, 110, 115];

/**
 * Modify skilldesc.txt rows based on placements:
 * - Update SkillPage (tab index + 1)
 * - Update SkillRow and SkillColumn
 * - Update IconCel
 * - Update dsc3textb synergy references
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

  // Resolve column indices dynamically
  const skillPageIdx = safeGetCol(headers, 'SkillPage', COL.SkillPage);
  const skillRowIdx = safeGetCol(headers, 'SkillRow', COL.SkillRow);
  const skillColIdx = safeGetCol(headers, 'SkillColumn', COL.SkillColumn);
  const iconCelIdx = safeGetCol(headers, 'IconCel', COL.IconCel);
  const listRowIdx = safeGetCol(headers, 'ListRow', COL.ListRow);

  for (const row of rows) {
    const skilldescName = row[0]; // skilldesc column is always first
    const placement = skilldescToPlacement.get(skilldescName);
    if (!placement) continue;

    // SkillPage = tab index + 1 (1-based)
    row[skillPageIdx] = String(placement.tabIndex + 1);

    // SkillRow and SkillColumn from grid position
    row[skillRowIdx] = String(placement.row);
    row[skillColIdx] = String(placement.col);

    // ListRow = position within tab (1-based sequential)
    row[listRowIdx] = String(placement.skillIndex % 10 + 1);

    // IconCel = new icon index
    row[iconCelIdx] = String(placement.iconCel);

    // Update dsc3textb synergy references
    const newTextBs = descSynergyUpdates.get(placement.skill.skill);
    if (newTextBs) {
      // Clear all dsc3 slots first
      for (let i = 0; i < 7; i++) {
        if (DSC3_LINE_INDICES[i] < row.length) row[DSC3_LINE_INDICES[i]] = '';
        if (DSC3_TEXTA_INDICES[i] < row.length) row[DSC3_TEXTA_INDICES[i]] = '';
        if (DSC3_TEXTB_INDICES[i] < row.length) row[DSC3_TEXTB_INDICES[i]] = '';
        if (DSC3_CALCA_INDICES[i] < row.length) row[DSC3_CALCA_INDICES[i]] = '';
        if (DSC3_CALCB_INDICES[i] < row.length) row[DSC3_CALCB_INDICES[i]] = '';
      }

      // Fill in synergy header
      if (newTextBs.length > 0 && DSC3_LINE_INDICES[0] < row.length) {
        row[DSC3_LINE_INDICES[0]] = '40'; // line type for synergy header
        row[DSC3_TEXTA_INDICES[0]] = 'Sksyn';
        row[DSC3_TEXTB_INDICES[0]] = newTextBs[0];
        row[DSC3_CALCA_INDICES[0]] = '2';
      }

      // Fill remaining synergy entries
      for (let i = 1; i < newTextBs.length && i < 7; i++) {
        if (DSC3_LINE_INDICES[i] < row.length) {
          row[DSC3_LINE_INDICES[i]] = '76'; // line type for synergy bonus
          row[DSC3_TEXTA_INDICES[i]] = 'Magdplev';
          row[DSC3_TEXTB_INDICES[i]] = newTextBs[i];
          row[DSC3_CALCA_INDICES[i]] = 'par8';
        }
      }
    }
  }
}

function safeGetCol(headers: string[], name: string, fallback: number): number {
  const idx = headers.indexOf(name);
  return idx !== -1 ? idx : fallback;
}
