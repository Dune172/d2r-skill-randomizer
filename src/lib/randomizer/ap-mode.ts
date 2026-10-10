/**
 * ap-mode.ts — Archipelago mode: the table invariants and the client manifest.
 *
 * In an Archipelago mod the multiworld is the only source of skill points. The companion
 * client (tools/ap-client) writes the character's unspent-point count, the player spends
 * the points in the tree, and the game allocates and saves the skills itself.
 *
 * The invariants that follow from that:
 *
 *  - SkillsPerLevel stays at 1. Levelling is not meant to grant anything (the client
 *    writes the count back down), but the stat list is SPARSE: a character that has
 *    never held a skill point has no entry for the client to write.
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
 * ITEMS THE CLIENT CANNOT CONJURE. The client can change the value of a stat the game
 * already holds; it cannot create an item. Two data-only mechanisms turn a stat into
 * something physical, and both lean on cubemain.txt's `op` column, which lets a recipe
 * require a value of one of the player's stats:
 *
 *  - Keys. The vanilla Horadric Staff and Khalim's Will recipes are made to require a
 *    count held in the custom stat `ap_keys`. Until the multiworld has sent enough
 *    Progressive Horadric Keys the Cube refuses, so Duriel and Mephisto stay shut.
 *
 *  - The mailbox. The character starts with an Archipelago Sigil. When an item is
 *    waiting, the client sets `ap_mail` to that item's offer code, and exactly one
 *    recipe (the Sigil alone, `ap_mail` == offer) produces the item.
 *
 *    The client cannot see the Cube, so the recipe itself makes delivery exactly-once:
 *      at most once  - it returns the OTHER Sigil. There are two, and an offer's recipe
 *                      for one produces the other, so the same offer cannot fire twice.
 *      at least once - it also returns a Receipt. Using the Receipt adds one to
 *                      `ap_mail`, which the client can see: offer + 1 means delivered.
 *    Offers are even and their acknowledgements odd, so the two never collide.
 *
 * Both custom stats hold their value PLUS ONE, so they are never zero: the game drops
 * zero-valued stats from a character, and the client can only write an entry that exists.
 */
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
export const AP_CONTRACT_VERSION = 3;

export interface ApModeOptions {
  /** The class this Archipelago slot plays. */
  characterClass: ClassCode;
  /** Save-folder name, isolating this slot's characters from every other run. */
  savepath: string;
  /** Lock the Horadric Staff and Khalim's Will recipes behind Progressive Horadric Keys. */
  keyItems: boolean;
}

type Table = { headers: string[]; rows: string[][] };

const CLASS_NAMES = Object.fromEntries(CLASS_DEFS.map(d => [d.code, d.name])) as Record<ClassCode, string>;

/**
 * Unused vanilla items repurposed here. All four already have inventory and HD art, and
 * none of them drops or is sold in the unmodded game.
 */
const SIGIL_CODES = ['hrt', 'sol'] as const; // "Heart" and "Soul", monster parts
const ATTUNEMENT_CODE = 'elx';               // "Elixir"
const RECEIPT_CODE = 'hrb';                  // "Herb"

/** Keys needed before each quest recipe opens. Progressive, in the order the game needs them. */
export const AP_KEY_GATES = { horadricStaff: 2, khalimsWill: 5 } as const;

/** The mail stat's value when nothing is waiting. */
const MAIL_IDLE = 1;
/**
 * What a Draught of Attunement adds to the mail stat. Far above every offer and
 * acknowledgement, so a Draught drunk while an item is waiting reads as "re-attuned",
 * never as that item's acknowledgement.
 */
const MAIL_ATTUNED = 128;

const RUNE_NAMES = [
  'El', 'Eld', 'Tir', 'Nef', 'Eth', 'Ith', 'Tal', 'Ral', 'Ort', 'Thul', 'Amn', 'Sol',
  'Shael', 'Dol', 'Hel', 'Io', 'Lum', 'Ko', 'Fal', 'Lem', 'Pul', 'Um', 'Mal', 'Ist',
  'Gul', 'Vex', 'Ohm', 'Lo', 'Sur', 'Ber', 'Jah', 'Cham', 'Zod',
];

/** Everything deliverable through the mailbox. A position here is the item's identity. */
const MAILBOX_ITEMS = RUNE_NAMES.map((name, i) => ({
  item: `r${String(i + 1).padStart(2, '0')}`,
  name: `${name} Rune`,
}));

export interface ApMailItem {
  /** What the client writes into the mail stat to offer this item. Even; offer + 1 acknowledges it. */
  offer: number;
  /** misc.txt item code the recipe produces. */
  item: string;
  name: string;
}

/** What applyApTables added to the mod, for the manifest. */
export interface ApTables {
  /** itemstatcost.txt ids of the custom stats. `keys` stores the key count plus one. */
  stats: { keys: number; mail: number };
  sigils: string[];
  attunement: string;
  receipt: string;
  mailIdle: number;
  mailAttuned: number;
  mail: ApMailItem[];
  /** Present only when the quest recipes are locked. */
  keyGates?: { horadricStaff: number; khalimsWill: number };
  /** The class's starting strength + dexterity + energy + vitality, for counting spent stat points. */
  baseAttributes: number;
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
 * Add the custom stats, the Sigils and their recipes, and optionally the key gates.
 *
 * Mutates every table passed in. `itemNames` is the parsed item-names.json.
 */
export function applyApTables(args: {
  ap: ApModeOptions;
  itemstatcost: Table;
  misc: Table;
  cubemain: Table;
  charstats: Table;
  itemNames: { Key: string; [locale: string]: string | number }[];
}): ApTables {
  const { ap, itemstatcost, misc, cubemain, charstats, itemNames } = args;

  // The game drops a stat from the character when it reaches zero unless told to keep
  // it. The client writes these pools constantly, and an entry that vanishes every time
  // the last point is spent cannot be written until something recreates it.
  for (const name of ['statpts', 'newskills', 'gold']) {
    setCells(itemstatcost, findRow(itemstatcost, 'Stat', name), { keepzero: '1' });
  }

  const firstId = itemstatcost.rows.length;
  const stats = { keys: firstId, mail: firstId + 1 };
  for (const [name, id] of [['ap_keys', stats.keys], ['ap_mail', stats.mail]] as const) {
    if (itemstatcost.rows.some(r => r[0] === name)) throw new Error(`apMode: stat ${name} already exists`);
    appendRow(itemstatcost, {
      Stat: name, '*ID': String(id), 'Send Bits': '9', Saved: '1', CSvSigned: '0', CSvBits: '9',
      keepzero: '1', '*eol': '0',
    });
  }

  const repurpose = (code: string, name: string, cells: Record<string, string>) => {
    setCells(misc, findRow(misc, 'code', code), {
      // Never from a shop or a drop, worthless to a vendor, and no vanilla right-click
      // behaviour: monster parts would otherwise transmute themselves into a potion.
      spawnable: '0', cost: '0', Transmogrify: '0', TMogType: 'xxx',
      spelldesc: '', spelldescstr: '', state: '', len: '',
      stat1: '', calc1: '', stat2: '', calc2: '', stat3: '', calc3: '',
      ...cells,
    });
    const entry = itemNames.find(e => e.Key === code);
    if (!entry) throw new Error(`apMode: no item name ${code}`);
    for (const field of Object.keys(entry)) {
      if (field !== 'id' && field !== 'Key') entry[field] = name;
    }
  };
  // Player spell 8 adds each calc to its stat, permanently. That is how a stat entry the
  // client can write comes to exist, and how the Receipt signals a delivery.
  const addsToStats = { useable: '1', pSpell: '8' };
  for (const code of SIGIL_CODES) repurpose(code, 'Archipelago Sigil', { useable: '0', pSpell: '-1' });
  repurpose(ATTUNEMENT_CODE, 'Draught of Attunement', {
    ...addsToStats,
    stat1: 'ap_keys', calc1: '1', stat2: 'ap_mail', calc2: String(MAIL_ATTUNED), stat3: 'newskills', calc3: '1',
  });
  repurpose(RECEIPT_CODE, 'Archipelago Receipt', { ...addsToStats, stat1: 'ap_mail', calc1: '1' });

  // Every class starts with a Sigil and one Draught.
  for (const row of charstats.rows) {
    if (!row[0] || row[0] === 'Expansion') continue;
    for (const code of [SIGIL_CODES[0], ATTUNEMENT_CODE]) {
      const slot = Array.from({ length: 10 }, (_, i) => i + 1)
        .find(n => ['', '0'].includes(row[column(charstats, `item${n}`)]));
      if (!slot) throw new Error(`apMode: ${row[0]} has no free starting-item slot for ${code}`);
      setCells(charstats, row, {
        [`item${slot}`]: code, [`item${slot}loc`]: '', [`item${slot}count`]: '1', [`item${slot}quality`]: '2',
      });
    }
  }
  const classRow = charstats.rows.find(r => r[0] === CLASS_NAMES[ap.characterClass]);
  if (!classRow) throw new Error(`apMode: no charstats row for ${ap.characterClass}`);
  const baseAttributes = ['str', 'dex', 'int', 'vit']
    .reduce((sum, name) => sum + Number(classRow[column(charstats, name)]), 0);

  const mail: ApMailItem[] = MAILBOX_ITEMS.map((entry, i) => ({ offer: 2 * (i + 1), ...entry }));
  if (mail[mail.length - 1].offer + 1 >= MAIL_ATTUNED) throw new Error('apMode: mail offers reach the attunement value');
  const playerBaseStatEquals = '10';
  const playerBaseStatAtMost = '8';
  const playerBaseStatAtLeast = '7';
  const otherSigil = (code: string) => (code === SIGIL_CODES[0] ? SIGIL_CODES[1] : SIGIL_CODES[0]);
  for (const entry of mail) {
    for (const sigil of SIGIL_CODES) {
      appendRow(cubemain, {
        description: `Archipelago mail: ${entry.name} (${sigil})`, enabled: '1', version: '100',
        op: playerBaseStatEquals, param: String(stats.mail), value: String(entry.offer),
        numinputs: '1', 'input 1': sigil,
        output: entry.item, 'output b': otherSigil(sigil), 'output c': RECEIPT_CODE, '*eol': '0',
      });
    }
  }
  // With nothing waiting, a Sigil brews another Draught: the way back if a stat entry is
  // ever lost. Listed after the mail, and it keeps the Sigil it was given.
  for (const sigil of SIGIL_CODES) {
    appendRow(cubemain, {
      description: `Archipelago: brew a Draught of Attunement (${sigil})`, enabled: '1', version: '100',
      op: playerBaseStatAtMost, param: String(stats.mail), value: String(MAIL_IDLE),
      numinputs: '1', 'input 1': sigil, output: ATTUNEMENT_CODE, 'output b': sigil, '*eol': '0',
    });
  }

  let keyGates: ApTables['keyGates'];
  if (ap.keyItems) {
    keyGates = { ...AP_KEY_GATES };
    const gate = (output: string, keys: number) => {
      const rows = cubemain.rows.filter(r => r[column(cubemain, 'output')] === output && r[column(cubemain, 'enabled')] === '1');
      if (rows.length !== 1) throw new Error(`apMode: expected one recipe producing ${output}, found ${rows.length}`);
      setCells(cubemain, rows[0], { op: playerBaseStatAtLeast, param: String(stats.keys), value: String(keys + 1) });
    };
    gate('hst', keyGates.horadricStaff); // Staff of Kings + Amulet of the Viper
    gate('qf2', keyGates.khalimsWill);   // Khalim's Flail + Eye + Heart + Brain
  }

  return {
    stats, sigils: [...SIGIL_CODES], attunement: ATTUNEMENT_CODE, receipt: RECEIPT_CODE,
    mailIdle: MAIL_IDLE, mailAttuned: MAIL_ATTUNED, mail, keyGates, baseAttributes,
  };
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
