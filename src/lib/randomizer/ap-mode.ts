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
 *    The client cannot see the Cube, so the recipes themselves make delivery exactly-once:
 *      at most once  - there are two Sigils, and every item has a separate offer code
 *                      for each. A recipe takes one Sigil and returns the OTHER, so once
 *                      it has fired, the offer on the stat no longer matches the Sigil
 *                      in the player's hands and cannot fire again.
 *      at least once - it also returns a Receipt. Using the Receipt adds one to
 *                      `ap_mail`, which the client can see: offer + 1 means delivered.
 *    The client knows which Sigil the player holds by counting deliveries, and offers
 *    the next item under that Sigil's code. Offers are even, acknowledgements odd.
 *
 * Both custom stats hold their value PLUS ONE, so they are never zero: the game drops
 * zero-valued stats from a character, and the client can only write an entry that exists.
 *
 * HOW A STAT ENTRY COMES TO EXIST. Player spell 4 (in vanilla only on the unused Full
 * Healing and Full Mana potions, `hpf`/`mpf`) adds each statN/calcN of the item to the
 * drinker's base stats, permanently when `len` is empty. It is the one data-driven way
 * to create an entry, and three items use it:
 *
 *  - the Draught of Attunement creates ap_keys, ap_mail and the skill-point pool;
 *  - the Receipt adds one to ap_mail;
 *  - the Tonic of Renewal recreates the skill-point pool (and, with pooled stat points,
 *    the stat-point pool) after the player has spent it to zero and the game dropped it.
 *    A Sigil brews one only while ap_mail holds TONIC_REQUEST, which the client writes
 *    when a pool is missing and points are owed, so a Tonic cannot be brewed at will.
 *
 * Measured on D2R 3.3 (2026-10-29): the Draught created 5, 368 and 369 on both copies of
 * the character, the Receipt moved 369 from an offer to offer + 1, and all of it survived
 * Save and Exit. Spell 8, used before, ignores the stat columns entirely.
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
export const AP_CONTRACT_VERSION = 4;

export interface ApModeOptions {
  /** The class this Archipelago slot plays. */
  characterClass: ClassCode;
  /** Save-folder name, isolating this slot's characters from every other run. */
  savepath: string;
  /** Lock the Horadric Staff and Khalim's Will recipes behind Progressive Horadric Keys. */
  keyItems: boolean;
  /**
   * Stat points come only from the multiworld, so the Tonic recreates the stat-point pool
   * too. Without this it must not: nothing would take the free stat point back.
   */
  pooledStats?: boolean;
}

type Table = { headers: string[]; rows: string[][] };

const CLASS_NAMES = Object.fromEntries(CLASS_DEFS.map(d => [d.code, d.name])) as Record<ClassCode, string>;

/**
 * Unused vanilla items repurposed here. All five already have inventory and HD art, and
 * none of them drops or is sold in the unmodded game.
 */
const SIGIL_CODES = ['hrt', 'sol'] as const; // "Heart" and "Soul", monster parts
const ATTUNEMENT_CODE = 'elx';               // "Elixir"
const RECEIPT_CODE = 'hrb';                  // "Herb"
const TONIC_CODE = 'mpf';                    // "Full Mana Potion", already a spell 4 item

/**
 * String ids for names the base game lacks (the Tonic's item, `mpf`, has none). Ids are
 * global across every strings file: 40000+ are the pipeline's books, 41000+ its synergy
 * lines, and no vanilla string in data/local/strings reaches 40000.
 */
const AP_STRING_ID_BASE = 42000;

/** Keys needed before each quest recipe opens. Progressive, in the order the game needs them. */
export const AP_KEY_GATES = { horadricStaff: 2, khalimsWill: 5 } as const;

/** The mail stat's value when nothing is waiting. */
const MAIL_IDLE = 1;
/**
 * What a Draught of Attunement adds to the mail stat. Far above every offer and
 * acknowledgement, so a Draught drunk while an item is waiting reads as "re-attuned",
 * never as that item's acknowledgement.
 */
const MAIL_ATTUNED = 256;
/**
 * What the client writes to the mail stat to let a Sigil brew a Tonic of Renewal. Even,
 * like an offer, above every offer and acknowledgement and below MAIL_ATTUNED.
 */
const TONIC_REQUEST = 200;

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
  /** Which Sigil (index into `sigils`) the recipe for this offer takes. It returns the other. */
  sigil: number;
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
  /** Recreates an emptied point pool. Brewed from a Sigil only while the mail stat holds tonicRequest. */
  tonic: string;
  tonicRequest: number;
  /** Whether the Tonic also restores the stat-point pool (stat points pooled). */
  tonicStatPoints: boolean;
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

  // Meant to keep these entries alive at zero, so the client always has one to write.
  // Measured on D2R 3.3: it does NOT for base stats, so the game still drops a spent
  // pool; the Tonic of Renewal is what brings it back. Kept as harmless, in case a later
  // patch honours it.
  for (const name of ['statpts', 'newskills', 'gold']) {
    setCells(itemstatcost, findRow(itemstatcost, 'Stat', name), { keepzero: '1' });
  }

  const firstId = itemstatcost.rows.length;
  const stats = { keys: firstId, mail: firstId + 1 };
  for (const [name, id] of [['ap_keys', stats.keys], ['ap_mail', stats.mail]] as const) {
    if (itemstatcost.rows.some(r => r[0] === name)) throw new Error(`apMode: stat ${name} already exists`);
    // 10 bits (up to 1023): two Draughts hoarded and drunk together put 512 on ap_mail.
    appendRow(itemstatcost, {
      Stat: name, '*ID': String(id), 'Send Bits': '10', Saved: '1', CSvSigned: '0', CSvBits: '10',
      keepzero: '1', '*eol': '0',
    });
  }

  let nextStringId = AP_STRING_ID_BASE;
  const repurpose = (code: string, name: string, cells: Record<string, string>) => {
    setCells(misc, findRow(misc, 'code', code), {
      // Never from a shop or a drop, worthless to a vendor, and no vanilla right-click
      // behaviour: monster parts would otherwise transmute themselves into a potion.
      // Not beltable either: an item fed to the mercenary from the belt would be used
      // up without the player, and a Receipt used that way loses its delivery.
      spawnable: '0', cost: '0', Transmogrify: '0', TMogType: 'xxx', belt: '0', autobelt: '0',
      spelldesc: '', spelldescstr: '', state: '', len: '',
      stat1: '', calc1: '', stat2: '', calc2: '', stat3: '', calc3: '',
      ...cells,
    });
    let entry = itemNames.find(e => e.Key === code);
    if (!entry) {
      // Every locale the file carries, so no language falls back to a missing string.
      const locales = Object.keys(itemNames[0] ?? {}).filter(f => f !== 'id' && f !== 'Key');
      if (locales.length === 0) throw new Error(`apMode: no item name ${code}, and no locales to add one`);
      entry = { id: nextStringId++, Key: code };
      itemNames.push(entry);
      for (const locale of locales) entry[locale] = name;
    }
    for (const field of Object.keys(entry)) {
      if (field !== 'id' && field !== 'Key') entry[field] = name;
    }
  };
  // Player spell 4 adds each calc to its stat, permanently while `len` is empty (repurpose
  // clears it). That is how a stat entry the client can write comes to exist, and how the
  // Receipt signals a delivery. Spell 8 looks similar in the tables and ignores them.
  const addsToStats = { useable: '1', pSpell: '4' };
  for (const code of SIGIL_CODES) repurpose(code, 'Archipelago Sigil', { useable: '0', pSpell: '-1' });
  repurpose(ATTUNEMENT_CODE, 'Draught of Attunement', {
    ...addsToStats,
    stat1: 'ap_keys', calc1: '1', stat2: 'ap_mail', calc2: String(MAIL_ATTUNED), stat3: 'newskills', calc3: '1',
  });
  repurpose(RECEIPT_CODE, 'Archipelago Receipt', { ...addsToStats, stat1: 'ap_mail', calc1: '1' });
  // One point in each pool the client manages. The client writes the pool straight back
  // to its target, so all the Tonic really gives is an entry to write to.
  repurpose(TONIC_CODE, 'Tonic of Renewal', {
    ...addsToStats, stat1: 'newskills', calc1: '1',
    ...(ap.pooledStats ? { stat2: 'statpts', calc2: '1' } : {}),
  });

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

  // Two offers per item, one for each Sigil: 2, 4, 6, ... with the acknowledgements between.
  const mail: ApMailItem[] = MAILBOX_ITEMS.flatMap((entry, i) =>
    SIGIL_CODES.map((_, sigil) => ({ offer: 2 * (i * SIGIL_CODES.length + sigil + 1), sigil, ...entry })));
  if (mail[mail.length - 1].offer + 1 >= MAIL_ATTUNED) throw new Error('apMode: mail offers reach the attunement value');
  if (TONIC_REQUEST <= mail[mail.length - 1].offer + 1 || TONIC_REQUEST >= MAIL_ATTUNED || TONIC_REQUEST % 2) {
    throw new Error('apMode: the Tonic request must be even, above every offer and below the attunement value');
  }
  const playerBaseStatEquals = '10';
  const playerBaseStatAtMost = '8';
  const playerBaseStatAtLeast = '7';
  for (const entry of mail) {
    const taken = SIGIL_CODES[entry.sigil];
    const returned = SIGIL_CODES[1 - entry.sigil];
    appendRow(cubemain, {
      description: `Archipelago mail: ${entry.name} (${taken})`, enabled: '1', version: '100',
      op: playerBaseStatEquals, param: String(stats.mail), value: String(entry.offer),
      numinputs: '1', 'input 1': taken,
      output: entry.item, 'output b': returned, 'output c': RECEIPT_CODE, '*eol': '0',
    });
  }
  // A Sigil also brews, keeping the Sigil it was given:
  //  - a Draught while the mail stat does not exist yet (the starting Draught was lost
  //    before it was drunk). Once it exists it never reads 0 again (value + 1);
  //  - a Tonic only while the client has put TONIC_REQUEST on the stat, so the point
  //    pools cannot be refilled at will with the client off.
  for (const sigil of SIGIL_CODES) {
    appendRow(cubemain, {
      description: `Archipelago: brew a Draught of Attunement (${sigil})`, enabled: '1', version: '100',
      op: playerBaseStatAtMost, param: String(stats.mail), value: '0',
      numinputs: '1', 'input 1': sigil, output: ATTUNEMENT_CODE, 'output b': sigil, '*eol': '0',
    });
    appendRow(cubemain, {
      description: `Archipelago: brew a Tonic of Renewal (${sigil})`, enabled: '1', version: '100',
      op: playerBaseStatEquals, param: String(stats.mail), value: String(TONIC_REQUEST),
      numinputs: '1', 'input 1': sigil, output: TONIC_CODE, 'output b': sigil, '*eol': '0',
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
    tonic: TONIC_CODE, tonicRequest: TONIC_REQUEST, tonicStatPoints: ap.pooledStats === true,
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
