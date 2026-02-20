import fs from 'fs';
import path from 'path';
import { TreePage, GridSlot, SkillEntry, SkillDescEntry } from './randomizer/types';

const DATA_DIR = path.join(process.cwd(), 'data');

/**
 * Parse skill_tree_grid.csv → Map<string, TreePage>
 * Key format: "ama-1", "sor-2", etc.
 */
export function loadTreeGrid(): Map<string, TreePage> {
  const csvPath = path.join(DATA_DIR, 'skill_tree_grid.csv');
  const content = fs.readFileSync(csvPath, 'utf-8');
  const lines = content.trim().replace(/\r/g, '').split('\n');
  const header = lines[0].split(',');

  const pages = new Map<string, TreePage>();

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    const className = cols[0];
    const classCode = cols[1];
    const tree = parseInt(cols[2]);
    const row = parseInt(cols[3]);
    const col = parseInt(cols[4]);
    const status = cols[5] as 'FILLED' | 'EMPTY';
    const skill = cols[6] || undefined;

    const key = `${classCode}-${tree}`;

    if (!pages.has(key)) {
      pages.set(key, {
        classCode,
        className,
        treeIndex: tree,
        slots: [],
        filledCount: 0,
      });
    }

    const page = pages.get(key)!;
    const slot: GridSlot = { row, col, status, skill };
    page.slots.push(slot);
    if (status === 'FILLED') {
      page.filledCount++;
    }
  }

  return pages;
}

/**
 * Parse skills.json → SkillEntry[] (only class skills with charclass)
 */
export function loadSkills(): SkillEntry[] {
  const jsonPath = path.join(DATA_DIR, 'json', 'skills.json');
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  const skills: SkillEntry[] = [];

  for (const [key, value] of Object.entries(data)) {
    const v = value as Record<string, unknown>;
    if (!v.charclass) continue;

    skills.push({
      id: v['*Id'] as number,
      skill: v.skill as string,
      charclass: v.charclass as string,
      skilldesc: (v.skilldesc as string) || '',
      lineNumber: v.lineNumber as number,
      reqlevel: (v.reqlevel as number) || 1,
      EDmgSymPerCalc: (v.EDmgSymPerCalc as string) || undefined,
      ELenSymPerCalc: (v.ELenSymPerCalc as string) || undefined,
      DmgSymPerCalc: (v.DmgSymPerCalc as string) || undefined,
      reqskill1: (v.reqskill1 as string) || undefined,
      reqskill2: (v.reqskill2 as string) || undefined,
      reqskill3: (v.reqskill3 as string) || undefined,
      passiveitype: (v.passiveitype as string) || undefined,
      itypea1: (v.itypea1 as string) || undefined,
      itypea2: (v.itypea2 as string) || undefined,
      itypea3: (v.itypea3 as string) || undefined,
    });
  }

  return skills;
}

/**
 * Parse skilldesc.json → Map<string, SkillDescEntry>
 * Keyed by skilldesc name
 */
export function loadSkillDescs(): Map<string, SkillDescEntry> {
  const jsonPath = path.join(DATA_DIR, 'json', 'skilldesc.json');
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  const descs = new Map<string, SkillDescEntry>();

  for (const [key, value] of Object.entries(data)) {
    const v = value as Record<string, unknown>;
    if (!v.skilldesc) continue;

    const dsc3textb: string[] = [];
    for (let i = 1; i <= 7; i++) {
      const tb = v[`dsc3textb${i}`] as string;
      if (tb) dsc3textb.push(tb);
      else break;
    }

    descs.set(v.skilldesc as string, {
      skilldesc: v.skilldesc as string,
      SkillPage: (v.SkillPage as number) || 0,
      SkillRow: (v.SkillRow as number) || 0,
      SkillColumn: (v.SkillColumn as number) || 0,
      IconCel: (v.IconCel as number) || 0,
      strName: (v['str name'] as string) || '',
      lineNumber: parseInt(key),
      dsc3textb,
    });
  }

  return descs;
}

/**
 * Parse tab-delimited TXT file → { headers: string[], rows: string[][] }
 * Each row is an array of column values (strings).
 * Handles mixed line endings (CRLF/LF) and normalizes rows to match header column count.
 */
export function loadTxtFile(filename: string): { headers: string[]; rows: string[][] } {
  const filePath = path.join(DATA_DIR, 'txt', filename);
  const content = fs.readFileSync(filePath, 'utf-8');
  // Handle mixed line endings: normalize all to \n
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  const headers = lines[0].split('\t');
  const headerCount = headers.length;
  const rows: string[][] = [];

  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '') continue;
    const cols = lines[i].split('\t');

    // Normalize column count to match header:
    // - Truncate extra columns (e.g. Warlock rows with 322 cols vs 262 header)
    // - Pad missing columns with empty strings
    if (cols.length > headerCount) {
      rows.push(cols.slice(0, headerCount));
    } else if (cols.length < headerCount) {
      rows.push([...cols, ...Array(headerCount - cols.length).fill('')]);
    } else {
      rows.push(cols);
    }
  }

  return { headers, rows };
}

/**
 * Serialize headers + rows back to tab-delimited text.
 * Uses \r\n line endings as D2R expects.
 */
export function serializeTxtFile(headers: string[], rows: string[][]): string {
  const headerCount = headers.length;
  const lines = [
    headers.join('\t'),
    ...rows.map(r => {
      // Ensure each row has exactly the right number of columns
      const normalized = r.length >= headerCount
        ? r.slice(0, headerCount)
        : [...r, ...Array(headerCount - r.length).fill('')];
      return normalized.join('\t');
    }),
  ];
  return lines.join('\r\n') + '\r\n';
}

export type StringEntry = Record<string, unknown> & { Key: string; enUS: string };

/**
 * Load skills.json string table → StringEntry[]
 * Used for updating skill names and descriptions under Normal Logic.
 */
export function loadSkillStrings(): StringEntry[] {
  const filePath = path.join(DATA_DIR, 'local', 'strings', 'skills.json');
  const raw = fs.readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, ''); // strip BOM
  return JSON.parse(raw) as StringEntry[];
}

/**
 * Get column index by header name
 */
export function getColumnIndex(headers: string[], name: string): number {
  const idx = headers.indexOf(name);
  if (idx === -1) {
    throw new Error(`Column "${name}" not found in headers`);
  }
  return idx;
}
