/**
 * Reader/patcher for data/global/animdata.d2 — the engine's per-animation
 * cache of frame counts, speed, and frame events. The frame-event data here
 * DUPLICATES the COF's frame-event block and the engine reads it
 * preferentially: a COF patch without the matching animdata patch at the
 * same frame index causes blinking/desynced animations in game.
 *
 * Format (Paul Siramy's analysis, corroborated by OpenDiablo2's animdata.go):
 *   256 hash blocks, concatenated. Each block:
 *     uint32 LE record count (0..~67)
 *     count × 160-byte records:
 *       offset 0   8-byte null-padded uppercase COF name (no extension)
 *       offset 8   uint32 LE framesPerDirection
 *       offset 12  uint16 LE animation speed (256 = base 25 fps)
 *       offset 14  2 bytes, always zero
 *       offset 16  144 frame-event bytes (0 none / 1 attack / 2 missile /
 *                  3 sound / 4 skill), one per frame
 *
 * We never add, remove, or reorder records, so record byte offsets are
 * stable and no hash computation is needed — a linear scan finds everything.
 */

const BLOCK_COUNT = 256;
const RECORD_SIZE = 160;
const NAME_SIZE = 8;
const EVENTS_OFFSET = 16;
export const ANIMDATA_NUM_EVENTS = 144;

export interface AnimDataRecord {
  /** Uppercase COF name without extension, e.g. "SOA1HTH" */
  name: string;
  /** Byte offset of this record's start within the file */
  offset: number;
  framesPerDirection: number;
  speed: number;
  /** The 144 per-frame event values (frames beyond framesPerDirection are unused) */
  events: number[];
}

export function parseAnimData(buf: Buffer): AnimDataRecord[] {
  const records: AnimDataRecord[] = [];
  let off = 0;
  for (let block = 0; block < BLOCK_COUNT; block++) {
    if (off + 4 > buf.length) {
      throw new Error(`animdata.d2: truncated at block ${block} (offset ${off})`);
    }
    const count = buf.readUInt32LE(off);
    off += 4;
    if (count > 1000) {
      throw new Error(`animdata.d2: implausible record count ${count} in block ${block} — not an animdata file?`);
    }
    if (off + count * RECORD_SIZE > buf.length) {
      throw new Error(`animdata.d2: block ${block} overruns file end`);
    }
    for (let i = 0; i < count; i++) {
      const nameRaw = buf.toString('ascii', off, off + NAME_SIZE);
      const nul = nameRaw.indexOf('\0');
      const name = (nul === -1 ? nameRaw : nameRaw.slice(0, nul)).toUpperCase();
      const events: number[] = [];
      for (let e = 0; e < ANIMDATA_NUM_EVENTS; e++) {
        events.push(buf[off + EVENTS_OFFSET + e]);
      }
      records.push({
        name,
        offset: off,
        framesPerDirection: buf.readUInt32LE(off + 8),
        speed: buf.readUInt16LE(off + 12),
        events,
      });
      off += RECORD_SIZE;
    }
  }
  if (off !== buf.length) {
    throw new Error(`animdata.d2: ${buf.length - off} trailing bytes after last block`);
  }
  return records;
}

/** Find all records for a COF name (a name can appear once per its hash block; expect 0 or 1). */
export function findAnimRecord(records: AnimDataRecord[], cofName: string): AnimDataRecord | undefined {
  const target = cofName.toUpperCase().replace(/\.COF$/i, '');
  return records.find(r => r.name === target);
}

/**
 * Write (in place) a record's framesPerDirection and full event array so the
 * record matches its COF exactly. Used to repair vanilla records whose frame
 * data desyncs from the COF/DCC art (the 14 Warlock A1/A2 records): a
 * mismatch makes the engine fire trigger frames at the wrong time or not at
 * all, and blinks the animation in legacy graphics mode.
 *
 * Mutates `buf` directly (callers patch several records into one copy).
 * Never changes record count/order/offsets — only field values.
 */
export function syncAnimDataRecord(
  buf: Buffer,
  record: AnimDataRecord,
  framesPerDirection: number,
  events: number[],
): void {
  if (!Number.isInteger(framesPerDirection) || framesPerDirection <= 0 || framesPerDirection > ANIMDATA_NUM_EVENTS) {
    throw new Error(`animdata.d2 ${record.name}: invalid framesPerDirection ${framesPerDirection}`);
  }
  if (events.length !== framesPerDirection) {
    throw new Error(
      `animdata.d2 ${record.name}: ${events.length} events for ${framesPerDirection} frames`
    );
  }
  buf.writeUInt32LE(framesPerDirection, record.offset + 8);
  for (let i = 0; i < ANIMDATA_NUM_EVENTS; i++) {
    const value = i < events.length ? events[i] : 0;
    if (!Number.isInteger(value) || value < 0 || value > 4) {
      throw new Error(`animdata.d2 ${record.name}: invalid event value ${value} at frame ${i}`);
    }
    buf[record.offset + EVENTS_OFFSET + i] = value;
  }
}

/**
 * Return a copy of the animdata buffer with one record's event value at one
 * frame changed. Must be called with the same frame index used for the COF
 * patch, or the animation desyncs (blinks) in game.
 */
export function patchAnimDataEvent(
  buf: Buffer,
  record: AnimDataRecord,
  frame: number,
  value: number,
): Buffer {
  if (!Number.isInteger(frame) || frame < 0 || frame >= ANIMDATA_NUM_EVENTS) {
    throw new Error(`animdata.d2 ${record.name}: frame ${frame} out of range (0..${ANIMDATA_NUM_EVENTS - 1})`);
  }
  if (frame >= record.framesPerDirection) {
    throw new Error(
      `animdata.d2 ${record.name}: frame ${frame} >= framesPerDirection ${record.framesPerDirection}`
    );
  }
  if (!Number.isInteger(value) || value < 0 || value > 4) {
    throw new Error(`animdata.d2 ${record.name}: invalid event value ${value} (expected 0-4)`);
  }
  const out = Buffer.from(buf);
  out[record.offset + EVENTS_OFFSET + frame] = value;
  return out;
}
