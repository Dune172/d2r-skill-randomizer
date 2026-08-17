export type ClassCode = 'ama' | 'sor' | 'nec' | 'pal' | 'bar' | 'dru' | 'ass' | 'war';

export interface ClassDef {
  name: string;
  code: ClassCode;
  charclass: string; // as used in skills.txt charclass column
  spritePrefix: string; // e.g. 'am', 'so', 'ne', 'pa', 'ba', 'dr', 'as', 'wa'
  iconFolder: string; // folder name under data/sprites/icons/
}

export interface GridSlot {
  row: number; // 1-6
  col: number; // 1-3
  status: 'FILLED' | 'EMPTY';
  skill?: string; // original skill name from CSV
}

export interface TreePage {
  classCode: string; // original class code (e.g. 'ama')
  className: string; // original class name
  treeIndex: number; // 1, 2, or 3
  slots: GridSlot[];
  filledCount: number;
}

export interface SkillEntry {
  id: number;
  skill: string; // skill name
  charclass: string; // original class
  skilldesc: string;
  lineNumber: number; // row index in skills.json
  reqlevel: number; // required level (1, 6, 12, 18, 24, 30)
  // synergy formula columns
  EDmgSymPerCalc?: string;
  ELenSymPerCalc?: string;
  DmgSymPerCalc?: string;
  reqskill1?: string;
  reqskill2?: string;
  reqskill3?: string;
  // 1 = skill is a passive (no execution path; ineligible as a CTC/charged target)
  passive?: number;
  // weapon type restriction columns
  passiveitype?: string;
  itypea1?: string;
  itypea2?: string;
  itypea3?: string;
  itypeb1?: string;
  // animation code (from skills.json anim column)
  anim?: string;
  // non-empty if skill is a paladin-style aura (e.g. "prayer", "might", "defiance")
  aurastate?: string;
  // element type: 'fire', 'cold', 'ltng', 'pois', etc. (from skills.json EType)
  etype?: string;
  // class-usability restrictions
  weapsel?: number;  // 3 = requires dual weapons (Barbarian/Assassin only)
  restrict?: number; // 2 = requires shapeshifted form (Druid only)
  summon?: string;   // non-empty if skill summons a pet (e.g. 'wargoatman', 'ClayGolem')
}

export interface SkillDescEntry {
  skilldesc: string;
  SkillPage: number;
  SkillRow: number;
  SkillColumn: number;
  IconCel: number;
  hireableIconCel?: number; // vanilla HireableIconCel from skilldesc.json (if present)
  strName: string;
  // 'str long' / 'str short' — string KEYS into data/local/strings/skills.json,
  // not text; resolve via Key → enUS the same way strName is. These are the
  // in-game flavour description ("blast a continuous jet of ice\n..."), used by
  // the web spoiler tooltip. Empty for the ~9 rows that define neither.
  strLong: string;
  strShort: string;
  lineNumber: number; // index in skilldesc.json
  // dsc3 synergy display columns
  dsc3textb: string[]; // up to 7 entries
}

export interface SkillPlacement {
  skill: SkillEntry;
  targetClass: ClassCode;
  treePage: TreePage;
  tabIndex: number; // 0, 1, 2 (which of the 3 tabs for this class)
  row: number;
  col: number;
  iconCel: number; // new icon index within class (0, 2, 4, ..., 58)
  skillIndex: number; // index within class (0-29)
}

export interface SpriteHeader {
  magic: string; // 'SpA1'
  version: number;
  frameWidth: number;
  totalWidth: number;
  height: number;
  frameCount: number;
  headerSize: number; // always 40
  rawHeader: Buffer; // full 40-byte header for preserving unknown fields
}

export interface RandomizerResult {
  seed: number;
  treeAssignments: Map<ClassCode, TreePage[]>;
  skillPlacements: SkillPlacement[];
  placementsByClass: Map<ClassCode, SkillPlacement[]>;
}

export interface PreviewData {
  seed: number;
  // True when the Mystery Box mutation is active: names are '???', descriptions
  // empty, and every icon is the single shared MYSTERY_ICON. Decided server-side
  // so the client never has to infer masking — and never receives the real values.
  masked: boolean;
  classes: {
    code: ClassCode;
    name: string;
    tabs: {
      sourceClass: string;
      sourceTree: number;
      skills: {
        name: string;
        // In-game flavour text; may contain a literal '\n'. Empty when the
        // skilldesc defines no description, or when masked.
        desc: string;
        originalClass: string;
        // ClassCode whose icon tile to render. Equals originalClass except when
        // masked, where it's MYSTERY_ICON.charclass.
        iconClass: string;
        // Vanilla IconCel — even, 0..58. Resolved through substitution chains;
        // see the comment in /api/preview.
        iconCel: number;
        row: number;
        col: number;
      }[];
    }[];
  }[];
}
