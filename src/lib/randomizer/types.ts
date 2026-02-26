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
  // weapon type restriction columns
  passiveitype?: string;
  itypea1?: string;
  itypea2?: string;
  itypea3?: string;
  itypeb1?: string;
  // animation code (from skills.json anim column)
  anim?: string;
  // class-usability restrictions
  weapsel?: number;  // 3 = requires dual weapons (Barbarian/Assassin only)
  restrict?: number; // 2 = requires shapeshifted form (Druid only)
}

export interface SkillDescEntry {
  skilldesc: string;
  SkillPage: number;
  SkillRow: number;
  SkillColumn: number;
  IconCel: number;
  strName: string;
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
  actOrder?: number[]; // present when actShuffle was requested; actOrder[i] = original act at difficulty position i+1
  classes: {
    code: ClassCode;
    name: string;
    tabs: {
      sourceClass: string;
      sourceTree: number;
      skills: {
        name: string;
        originalClass: string;
        row: number;
        col: number;
      }[];
    }[];
  }[];
}
