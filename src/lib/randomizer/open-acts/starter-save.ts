/**
 * Open Acts starter saves: patch a fresh level-1 template character (.d2s, D2R v105) so
 * Acts I–III are open from the start, and give it this seed's starting skill.
 *
 * D2R decides which act tabs (waypoints and quest log) exist from the act-access quest
 * flags that only Warriv and Meshif set, so no data file can open them. This patch sets
 * them the same way, in every difficulty. Otherwise Nightmare could lock a key item
 * inside an act the character can't enter yet.
 *
 * Layout (found by diffing real saves; in-game results in memory open-acts-spike):
 *   0  magic aa55aa55 · 4 version · 8 file size · 12 checksum
 *   21 progression (0 = Normal; left alone so Nightmare stays locked until earned)
 *   24 class · 27 level · 299 name (16 bytes, letters plus one - or _)
 *   'Woo!' at 403: 10-byte header, then 3 difficulties × 48 quest words
 *              word 7 = Act I done (Warriv), word 15 = Act II done (Meshif)
 *   'WS' at 701: 8-byte header, then 3 × 24 bytes: 02 01, then the waypoint bitfield
 *              bit 9 = Lut Gholein, bit 18 = Kurast Docks
 *   'if' marker, then 30 bytes: hard points for the class's 30 skill rows in order
 */

const MAGIC = 0xaa55aa55;
const VERSION = 105;
const QUEST_MARKER = 403;
const WAYPOINT_MARKER = 701;
const NAME_OFFSET = 299;
const NAME_BYTES = 16;
const ACT_DONE = 0x2001; // reward granted + primary goal done, as Warriv/Meshif write it
const ACT_DONE_WORDS = [7, 15];
const TOWN_WAYPOINT_BITS = [0, 9, 18];
const SKILL_SLOTS = 30;

export interface StarterSaveOptions {
  /** Character name (D2R: 2–15 letters, at most one - or _ not at the ends). */
  name: string;
  /** Index 0..29 of the seed's starting skill in the class's block, or null for none. */
  startSkillSlot: number | null;
}

export function isValidCharacterName(name: string): boolean {
  return /^[A-Za-z][A-Za-z_-]{0,13}[A-Za-z]$/.test(name) && (name.match(/[-_]/g) ?? []).length <= 1;
}

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

  for (let d = 0; d < 3; d++) {
    const quests = QUEST_MARKER + 10 + d * 96;
    for (const w of ACT_DONE_WORDS) {
      if (buf.readUInt16LE(quests + w * 2) === 0) buf.writeUInt16LE(ACT_DONE, quests + w * 2);
    }
    const wp = WAYPOINT_MARKER + 8 + d * 24;
    if (buf[wp] !== 2 || buf[wp + 1] !== 1) throw new Error(`starter save: waypoint block ${d} header`);
    for (const bit of TOWN_WAYPOINT_BITS) buf[wp + 2 + (bit >> 3)] |= 1 << (bit & 7);
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
