/**
 * Open Acts starter saves: patch a fresh level-1 template character (.d2s, D2R v105) so
 * the chosen acts are open from the start, and give it this seed's starting skill.
 *
 * D2R decides which act tabs (waypoints and quest log) exist from the act-access quest
 * flags that only Warriv and Meshif set, so no data file can open them. This patch sets
 * them the same way, in every difficulty. Otherwise Nightmare could lock a key item
 * inside an act the character can't enter yet.
 *
 * Layout (found by diffing real saves; in-game results in memory open-acts-spike):
 *   0  magic aa55aa55 · 4 version · 8 file size · 12 checksum
 *   20 status (bit 2 = hardcore) · 21 progression (0 = Normal; left alone so Nightmare
 *      stays locked until earned)
 *   24 class · 27 level · 299 name (16 bytes, letters plus one - or _)
 *   'Woo!' at 403: 10-byte header, then 3 difficulties × 48 quest words
 *              word 7 = traveled to Act II (Warriv), 15 = to Act III (Meshif),
 *              23 = to Act IV; Act V needs 26 = Terror's End done and 28 = Act IV
 *              completed (D2MOO A4Q2 / A4COMPLETED: Tyrael's portal checks the first).
 *              Without 26 the Act V tab stays hidden (tested in game 2026-10-29), and
 *              the quest log then shows Terror's End as "completed in a previous game"
 *              (Diablo can still be fought).
 *   'WS' at 701: 8-byte header, then 3 × 24 bytes: 02 01, then the waypoint bitfield
 *              bit 9 = Lut Gholein, 18 = Kurast Docks, 27 = Pandemonium Fortress,
 *              30 = Harrogath
 *   'if' marker, then 30 bytes: hard points for the class's 30 skill rows in order
 */

import { isValidCharacterName, type OpenAct } from './options';

const MAGIC = 0xaa55aa55;
const VERSION = 105;
const QUEST_MARKER = 403;
const WAYPOINT_MARKER = 701;
const NAME_OFFSET = 299;
const NAME_BYTES = 16;
const STATUS_OFFSET = 20;
const STATUS_HARDCORE = 0x04;
const ACT_DONE = 0x2001; // reward granted + primary goal done, as Warriv/Meshif write it
/** Per act that can start open: the quest words that grant access and its town waypoint bit. */
const ACT_ACCESS = {
  2: { words: [7], waypoint: 9 },
  3: { words: [15], waypoint: 18 },
  4: { words: [23], waypoint: 27 },
  5: { words: [26, 28], waypoint: 30 },
} as const;
/** Every quest word the patch may set, for tests. */
export const ACT_ACCESS_WORDS: Record<OpenAct, readonly number[]> = {
  2: ACT_ACCESS[2].words, 3: ACT_ACCESS[3].words, 4: ACT_ACCESS[4].words, 5: ACT_ACCESS[5].words,
};
const ROGUE_ENCAMPMENT_WAYPOINT = 0;
const SKILL_SLOTS = 30;

export interface StarterSaveOptions {
  /** Character name (D2R: 2–15 letters, at most one - or _ not at the ends). */
  name: string;
  /** Index 0..29 of the seed's starting skill in the class's block, or null for none. */
  startSkillSlot: number | null;
  /**
   * Acts to open, in every difficulty. Defaults to [2, 3]. Each act is only offered
   * together with the acts before it (Open Acts options enforce it).
   */
  openActs?: readonly OpenAct[];
  /** Make the character hardcore (status bit 2). */
  hardcore?: boolean;
}

export { isValidCharacterName };

export function d2sChecksum(buf: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) {
    const byte = i >= 12 && i < 16 ? 0 : buf[i];
    sum = (((sum << 1) | (sum >>> 31)) + byte) >>> 0;
  }
  return sum;
}

function expectMarker(buf: Buffer, at: number, text: string): void {
  if (buf.toString('latin1', at, at + text.length) !== text) {
    throw new Error(`starter save: '${text}' not at ${at} (template from a different D2R version?)`);
  }
}

function skillSection(buf: Buffer): number {
  const stats = buf.indexOf('gf', WAYPOINT_MARKER, 'latin1');
  const skills = stats < 0 ? -1 : buf.indexOf('if', stats + 2, 'latin1');
  if (skills < 0 || skills + 2 + SKILL_SLOTS > buf.length) throw new Error('starter save: no skill section');
  return skills + 2;
}

/** Return a patched copy of `template`. The template itself is not modified. */
export function patchStarterSave(template: Uint8Array, opts: StarterSaveOptions): Buffer {
  const buf = Buffer.from(template);
  if (buf.readUInt32LE(0) !== MAGIC) throw new Error('starter save: not a .d2s file');
  if (buf.readUInt32LE(4) !== VERSION) throw new Error(`starter save: version ${buf.readUInt32LE(4)}, expected ${VERSION}`);
  if (buf[27] !== 1) throw new Error('starter save: template is not level 1');
  expectMarker(buf, QUEST_MARKER, 'Woo!');
  expectMarker(buf, WAYPOINT_MARKER, 'WS');
  if (!isValidCharacterName(opts.name)) throw new Error(`starter save: invalid name ${opts.name}`);

  buf.fill(0, NAME_OFFSET, NAME_OFFSET + NAME_BYTES);
  buf.write(opts.name, NAME_OFFSET, 'latin1');
  if (opts.hardcore) buf[STATUS_OFFSET] |= STATUS_HARDCORE;
  else buf[STATUS_OFFSET] &= ~STATUS_HARDCORE;

  const acts = opts.openActs ?? [2, 3];
  for (let d = 0; d < 3; d++) {
    const quests = QUEST_MARKER + 10 + d * 96;
    const wp = WAYPOINT_MARKER + 8 + d * 24;
    if (buf[wp] !== 2 || buf[wp + 1] !== 1) throw new Error(`starter save: waypoint block ${d} header`);
    const bits: number[] = [ROGUE_ENCAMPMENT_WAYPOINT];
    for (const act of acts) {
      const { words, waypoint } = ACT_ACCESS[act];
      for (const word of words) {
        if (buf.readUInt16LE(quests + word * 2) === 0) buf.writeUInt16LE(ACT_DONE, quests + word * 2);
      }
      bits.push(waypoint);
    }
    for (const bit of bits) buf[wp + 2 + (bit >> 3)] |= 1 << (bit & 7);
  }

  const skills = skillSection(buf);
  buf.fill(0, skills, skills + SKILL_SLOTS);
  if (opts.startSkillSlot !== null) {
    if (opts.startSkillSlot < 0 || opts.startSkillSlot >= SKILL_SLOTS) throw new Error(`starter save: skill slot ${opts.startSkillSlot}`);
    buf[skills + opts.startSkillSlot] = 1;
  }

  buf.writeUInt32LE(buf.length, 8);
  buf.writeUInt32LE(d2sChecksum(buf), 12);
  return buf;
}

/**
 * Slot of `skillName` in the class block of the mod's skills.txt. The save stores the
 * class's 30 skills in row order, and every class block is contiguous.
 */
export function startSkillSlot(skillsHeaders: string[], skillsRows: string[][], classCode: string, skillName: string): number | null {
  if (!skillName) return null;
  const nameCol = skillsHeaders.indexOf('skill');
  const classCol = skillsHeaders.indexOf('charclass');
  const first = skillsRows.findIndex(r => r[classCol] === classCode);
  if (first < 0) throw new Error(`starter save: no skills for class ${classCode}`);
  for (let i = 0; i < SKILL_SLOTS; i++) {
    if (skillsRows[first + i]?.[classCol] !== classCode) throw new Error(`starter save: ${classCode} block is not 30 contiguous rows`);
  }
  const row = skillsRows.findIndex(r => r[nameCol] === skillName);
  const slot = row - first;
  if (row < 0 || slot < 0 || slot >= SKILL_SLOTS) throw new Error(`starter save: ${skillName} is not a ${classCode} skill`);
  return slot;
}
