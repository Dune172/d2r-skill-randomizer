/**
 * ap-mode.ts — Archipelago mode: the table invariants, the chat-panel message box and
 * the client manifest.
 *
 * In an Archipelago mod the multiworld is the only source of skill points. The companion
 * client (tools/ap-client) writes the character's unspent-point count, the player spends
 * the points in the tree, and the game allocates and saves the skills itself.
 *
 * The invariants that follow from that:
 *
 *  - SkillsPerLevel stays at 1. Levelling is not meant to grant anything (the client
 *    writes the count back down); it is simply left at a value that cannot surprise it.
 *
 *  - StartSkill is cleared. The normal pipeline picks one at random per class; a free
 *    skill outside Archipelago's control is exactly what this mode exists to prevent.
 *
 *  - Every class skill is reqlevel 1 with no prerequisites. Archipelago decides WHEN
 *    points arrive, not where they go, so the tree must accept a point anywhere.
 *
 *  - Monster and superunique rows (empty charclass) are left alone.
 *
 * The manifest lists the class's 30 skills by skills.txt ROW INDEX, the id the game
 * uses in memory, so the client can tell the character's own hard points from anything
 * else in the skill list. It is built after reorderSkillsRows has settled the row order.
 *
 * THE CLIENT CREATES ITS OWN STAT ENTRIES. A character's stat list is sparse: the game
 * drops a stat whose value reaches zero, and a fresh character has no entry for most of
 * them. The client inserts the entries it needs into the live stat list itself (proved on
 * D2R 3.3, 2026-10-30): the skill-point pool, the stat-point pool when stat points are
 * pooled, and the key stat below. So the mod ships no potions, no starting items and no
 * delivery recipes; every item the earlier contracts repurposed is vanilla again.
 *
 *  - Keys. The custom stat `ap_keys` holds the number of Progressive Horadric Keys the
 *    multiworld has sent PLUS ONE, so a character holding none still has a nonzero entry.
 *    With `keyItems`, the vanilla Horadric Staff and Khalim's Will recipes require it
 *    through cubemain.txt's `op` column (a recipe may require a value of one of the
 *    player's stats); until enough keys arrive the Cube refuses, so Duriel and Mephisto
 *    stay shut.
 *
 *  - Pooled stat points (`pooledStats`) need nothing from the tables: the client holds
 *    the stat-point pool at what the multiworld sent minus what was spent, which takes
 *    back what a level-up grants. `baseAttributes` in the manifest is how it counts
 *    what was spent.
 *
 * MESSAGES. Every AP mod ships the game's chat panel layouts (HUDMessagePanel, legacy and
 * HD) with one extra text box, `ArchipelagoMessages`, as the panel's first child. Its
 * text is AP_MESSAGE_CAPACITY spaces: the game allocates a buffer that size for the
 * string, which the client later overwrites in place with "You received ..." lines.
 * The vanilla layouts live in data/archipelago/layouts (see the README there).
 */
import fs from 'fs';
import path from 'path';
import { SkillPlacement, ClassCode } from './types';
import { CLASS_DEFS } from './config';
import { PIPELINE_VERSION } from './pipeline-version';

/**
 * Bumped when the manifest shape or an AP-mode invariant changes.
 *
 * It is part of the AP zip cache key, so forgetting to bump serves zips built by the old
 * code: in development that looks like "my change did nothing", and in production it
 * would hand clients a manifest that disagrees with the mod.
 */
export const AP_CONTRACT_VERSION = 5;

/** Name of the text box the mod adds to the chat panel for Archipelago messages. */
export const AP_MESSAGE_BOX = 'ArchipelagoMessages';
/**
 * Length of the box's placeholder text, all spaces. The game sizes the box's text buffer
 * from it, and the client writes at most this many bytes into that buffer.
 */
export const AP_MESSAGE_CAPACITY = 600;

export interface ApModeOptions {
  /** The class this Archipelago slot plays. */
  characterClass: ClassCode;
  /** Save-folder name, isolating this slot's characters from every other run. */
  savepath: string;
  /** Lock the Horadric Staff and Khalim's Will recipes behind Progressive Horadric Keys. */
  keyItems: boolean;
  /**
   * Stat points come only from the multiworld: level-ups grant none that the player keeps,
   * because the client holds the stat-point pool at what was sent minus what was spent.
   * No table changes; it is part of the slot's options (and the zip cache key).
   */
  pooledStats?: boolean;
}

type Table = { headers: string[]; rows: string[][] };

const CLASS_NAMES = Object.fromEntries(CLASS_DEFS.map(d => [d.code, d.name])) as Record<ClassCode, string>;

/** Keys needed before each quest recipe opens. Progressive, in the order the game needs them. */
export const AP_KEY_GATES = { horadricStaff: 2, khalimsWill: 5 } as const;

/** What applyApTables added to the mod, for the manifest. */
export interface ApTables {
  /** itemstatcost.txt id of the custom key stat; stores the key count plus one. */
  stats: { keys: number };
  /** Present only when the quest recipes are locked. */
  keyGates?: { horadricStaff: number; khalimsWill: number };
  /** The class's starting strength + dexterity + energy + vitality, for counting spent stat points. */
  baseAttributes: number;
  /** Name of the text box the mod adds to the chat panel (HUDMessagePanel) for Archipelago messages. */
  messageBox: string;
}

export interface ApSlot {
  /** Stable, seed-independent identity, e.g. "pal:S07": the class's skillIndex 0-29. */
  slotId: string;
  /** skills.txt `skill` column — the internal name. */
  skillName: string;
  /** skills.txt ROW INDEX in the generated mod: the skill id the game uses in memory. */
  skillId: number;
  /** Tree position, for display only. */
  tab: number;
  row: number;
  col: number;
}

export interface ApManifest {
  contractVersion: number;
  pipelineVersion: number;
  seed: number;
  modName: string;
  savepath: string;
  characterClass: ClassCode;
  /** Keyed by class code. Only the AP class is populated. */
  classes: Record<string, { slots: ApSlot[] }>;
  tables: ApTables;
}

function column(table: Table, name: string): number {
  const index = table.headers.indexOf(name);
  if (index < 0) throw new Error(`apMode: missing column ${name}`);
  return index;
}

function setCells(table: Table, row: string[], values: Record<string, string>): void {
  for (const [name, value] of Object.entries(values)) row[column(table, name)] = value;
}

function appendRow(table: Table, values: Record<string, string>): void {
  const row = new Array<string>(table.headers.length).fill('');
  setCells(table, row, values);
  table.rows.push(row);
}

function findRow(table: Table, key: string, value: string): string[] {
  const index = column(table, key);
  const row = table.rows.find(r => r[index] === value);
  if (!row) throw new Error(`apMode: no ${key}=${value} row`);
  return row;
}

/**
 * Add the key stat and, optionally, the key gates; read the class's base attributes.
 *
 * Mutates `itemstatcost` and `cubemain`; only reads `charstats`.
 */
export function applyApTables(args: {
  ap: ApModeOptions;
  itemstatcost: Table;
  cubemain: Table;
  charstats: Table;
}): ApTables {
  const { ap, itemstatcost, cubemain, charstats } = args;

  // Meant to keep these entries alive at zero. Measured on D2R 3.3: it does NOT for base
  // stats, so the game still drops a spent pool and the client recreates it. Kept as
  // harmless, in case a later patch honours it.
  for (const name of ['statpts', 'newskills', 'gold']) {
    setCells(itemstatcost, findRow(itemstatcost, 'Stat', name), { keepzero: '1' });
  }

  // D2R indexes stats by row, so the new stat's id is the row it lands on.
  const stats = { keys: itemstatcost.rows.length };
  if (itemstatcost.rows.some(r => r[0] === 'ap_keys')) throw new Error('apMode: stat ap_keys already exists');
  appendRow(itemstatcost, {
    Stat: 'ap_keys', '*ID': String(stats.keys), 'Send Bits': '10', Saved: '1', CSvSigned: '0', CSvBits: '10',
    keepzero: '1', '*eol': '0',
  });

  const classRow = charstats.rows.find(r => r[0] === CLASS_NAMES[ap.characterClass]);
  if (!classRow) throw new Error(`apMode: no charstats row for ${ap.characterClass}`);
  const baseAttributes = ['str', 'dex', 'int', 'vit']
    .reduce((sum, name) => sum + Number(classRow[column(charstats, name)]), 0);

  let keyGates: ApTables['keyGates'];
  if (ap.keyItems) {
    keyGates = { ...AP_KEY_GATES };
    const playerBaseStatAtLeast = '7';
    const gate = (output: string, keys: number) => {
      const rows = cubemain.rows.filter(r => r[column(cubemain, 'output')] === output && r[column(cubemain, 'enabled')] === '1');
      if (rows.length !== 1) throw new Error(`apMode: expected one recipe producing ${output}, found ${rows.length}`);
      setCells(cubemain, rows[0], { op: playerBaseStatAtLeast, param: String(stats.keys), value: String(keys + 1) });
    };
    gate('hst', keyGates.horadricStaff); // Staff of Kings + Amulet of the Viper
    gate('qf2', keyGates.khalimsWill);   // Khalim's Flail + Eye + Heart + Brain
  }

  return { stats, keyGates, baseAttributes, messageBox: AP_MESSAGE_BOX };
}

/** Where each chat layout lands under the mod's data/ folder, and its message box. */
const AP_MESSAGE_LAYOUTS = [
  { file: 'hudmessagepanel.json', rect: { x: 20, y: 250, width: 560, height: 160 } },   // legacy graphics
  { file: 'hudmessagepanelhd.json', rect: { x: 60, y: 850, width: 1700, height: 450 } }, // HD
] as const;

/**
 * The chat panel layouts with the Archipelago message box, keyed by path under data/.
 *
 * The vanilla files have trailing commas, so they are not parsed and re-serialised: the
 * box is inserted as text right after the top-level panel's `"children": [`, and every
 * other byte of the game's file is kept.
 */
export function buildApLayoutFiles(dataDir: string): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  for (const { file, rect } of AP_MESSAGE_LAYOUTS) {
    const source = fs.readFileSync(path.join(dataDir, 'archipelago', 'layouts', file), 'utf8');
    const marker = '"children": [';
    // Depth of every marker: 1 means a key of the root object (the panel itself).
    const topLevel: number[] = [];
    let depth = 0;
    let inString = false;
    for (let i = 0; i < source.length; i++) {
      const ch = source[i];
      if (inString) {
        if (ch === '\\') i++;
        else if (ch === '"') inString = false;
        continue;
      }
      if (depth === 1 && source.startsWith(marker, i)) topLevel.push(i);
      if (ch === '"') inString = true;
      else if (ch === '{' || ch === '[') depth++;
      else if (ch === '}' || ch === ']') depth--;
    }
    if (topLevel.length !== 1 || topLevel[0] !== source.indexOf(marker)) {
      throw new Error(`apMode: ${file} has ${topLevel.length} top-level "children" arrays, or the first is nested`);
    }
    const eol = source.includes('\r\n') ? '\r\n' : '\n';
    const box = {
      type: 'TextBoxWidget', name: AP_MESSAGE_BOX,
      fields: {
        rect,
        text: ' '.repeat(AP_MESSAGE_CAPACITY),
        style: {
          pointSize: '$MediumFontSize',
          fontColor: { r: 255, g: 255, b: 255, a: 255 },
          fontFace: 'BlizzardGlobal',
          alignment: { h: 'left', v: 'bottom' },
          options: { newlineHandling: 'standard', lineWrap: true },
          dropShadow: '$DefaultDropShadow',
        },
      },
    };
    const lines = JSON.stringify(box, null, 4).split('\n').map(line => `        ${line}`);
    const at = topLevel[0] + marker.length;
    const layout = source.slice(0, at) + eol + lines.join(eol) + ',' + source.slice(at);
    files.set(`global/ui/layouts/${file}`, Buffer.from(layout, 'utf8'));
  }
  return files;
}

/** charstats.txt: levelling keeps creating the skill-point stat; no class starts with a skill. */
export function applyApCharstats(headers: string[], rows: string[][]): void {
  const splCol = headers.indexOf('SkillsPerLevel');
  const startCol = headers.indexOf('StartSkill');
  for (const row of rows) {
    if (!row[0] || row[0] === 'Expansion') continue;
    // Forced rather than left alone, so the client can rely on the stat being created.
    if (splCol !== -1) row[splCol] = '1';
    if (startCol !== -1) row[startCol] = '';
  }
}

/** skills.txt: every class skill accepts a point at clvl 1 with no prerequisite chain. */
export function applyApSkills(headers: string[], rows: string[][]): void {
  const classCol = headers.indexOf('charclass');
  const reqLvlCol = headers.indexOf('reqlevel');
  const reqCols = ['reqskill1', 'reqskill2', 'reqskill3']
    .map(n => headers.indexOf(n))
    .filter(i => i !== -1);
  if (classCol === -1) return;

  for (const row of rows) {
    if (!row[classCol]) continue; // monster or superunique skill
    if (reqLvlCol !== -1 && row[reqLvlCol] !== '') row[reqLvlCol] = '1';
    for (const c of reqCols) row[c] = '';
  }
}

/**
 * Build the client manifest from the FINAL skills.txt rows (after reorderSkillsRows).
 *
 * Throws rather than emitting a partial manifest: a missing or misindexed skill would
 * make the client miscount the character's spent points.
 */
export function buildApManifest(args: {
  seed: number;
  modName: string;
  ap: ApModeOptions;
  placements: SkillPlacement[];
  skillsRows: string[][];
  tables: ApTables;
}): ApManifest {
  const { seed, modName, ap, placements, skillsRows, tables } = args;

  const rowIndexByName = new Map<string, number>();
  skillsRows.forEach((row, i) => {
    if (row[0] && !rowIndexByName.has(row[0])) rowIndexByName.set(row[0], i);
  });

  const classPlacements = placements
    .filter(p => p.targetClass === ap.characterClass)
    .sort((a, b) => a.skillIndex - b.skillIndex);

  if (classPlacements.length !== 30) {
    throw new Error(
      `apMode: class ${ap.characterClass} has ${classPlacements.length} placements, expected 30`,
    );
  }

  const slots: ApSlot[] = classPlacements.map(p => {
    const skillId = rowIndexByName.get(p.skill.skill);
    if (skillId === undefined) {
      throw new Error(`apMode: skill "${p.skill.skill}" not found in the emitted skills.txt`);
    }
    return {
      slotId: `${ap.characterClass}:S${String(p.skillIndex).padStart(2, '0')}`,
      skillName: p.skill.skill,
      skillId,
      tab: p.tabIndex + 1,
      row: p.row,
      col: p.col,
    };
  });

  if (new Set(slots.map(s => s.slotId)).size !== slots.length) {
    throw new Error(`apMode: class ${ap.characterClass} has duplicate skill indices`);
  }

  return {
    contractVersion: AP_CONTRACT_VERSION,
    pipelineVersion: PIPELINE_VERSION,
    seed,
    modName,
    savepath: ap.savepath,
    characterClass: ap.characterClass,
    classes: { [ap.characterClass]: { slots } },
    tables,
  };
}
