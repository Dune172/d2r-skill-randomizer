/**
 * Reader/patcher for the legacy COF (component object file) binary format,
 * which D2R ships unchanged for its 2D animation pipeline.
 *
 * Layout (little-endian where multi-byte):
 *   offset 0       NumberOfLayers (uint8)
 *   offset 1       FramesPerDirection (uint8)
 *   offset 2       NumberOfDirections (uint8)
 *   offset 3-23    opaque header (0x14 marker + bounding box) — preserved verbatim
 *   offset 24      speed / anim rate (uint8)
 *   offset 25-27   body padding — preserved verbatim
 *   offset 28      layer info, 9 bytes × NumberOfLayers
 *   offset 28+9L   frame-event block, 1 byte × FramesPerDirection  ← trigger frames
 *   then           priority block, Directions × Frames × Layers bytes
 *
 * Total size = 28 + 9L + F + D·F·L. No checksum.
 *
 * Frame-event values: 0 = none, 1 = attack/hit, 2 = missile, 3 = sound, 4 = skill.
 * The engine creates a skill's hit/missile client-side only on the frame carrying
 * the matching event — a mode with no event byte swings but never lands.
 *
 * The ONLY safe mutation is changing an existing frame's event value. Never
 * change the L/F/D counts: a count mismatch with the DCC sprite data hard-crashes
 * the game (GfxUtil assertion) instead of failing gracefully.
 */

const FIXED_PREFIX_SIZE = 28; // 25-byte header + 3-byte body padding
const LAYER_SIZE = 9;

export const COF_EVENT = {
  NONE: 0,
  ATTACK: 1,
  MISSILE: 2,
  SOUND: 3,
  SKILL: 4,
} as const;

export interface CofInfo {
  layers: number;
  framesPerDirection: number;
  directions: number;
  speed: number;
  /** Byte offset of the frame-event block: 28 + 9 × layers */
  triggerOffset: number;
  /** One event value per frame (length === framesPerDirection) */
  events: number[];
}

export function cofExpectedSize(layers: number, frames: number, directions: number): number {
  return FIXED_PREFIX_SIZE + LAYER_SIZE * layers + frames + directions * frames * layers;
}

/**
 * Parse and validate a COF buffer. Throws if the file length doesn't match
 * the counts in the header (corrupt or not a COF).
 */
export function parseCof(buf: Buffer, name = 'cof'): CofInfo {
  if (buf.length < FIXED_PREFIX_SIZE) {
    throw new Error(`${name}: too small to be a COF (${buf.length} bytes)`);
  }
  const layers = buf[0];
  const framesPerDirection = buf[1];
  const directions = buf[2];
  const expected = cofExpectedSize(layers, framesPerDirection, directions);
  if (buf.length !== expected) {
    throw new Error(
      `${name}: size mismatch — header says L=${layers} F=${framesPerDirection} D=${directions} ` +
      `(expected ${expected} bytes), file is ${buf.length} bytes`
    );
  }
  const triggerOffset = FIXED_PREFIX_SIZE + LAYER_SIZE * layers;
  const events: number[] = [];
  for (let i = 0; i < framesPerDirection; i++) {
    events.push(buf[triggerOffset + i]);
  }
  return { layers, framesPerDirection, directions, speed: buf[24], triggerOffset, events };
}

/**
 * Return a copy of the COF with the event value of one existing frame changed.
 * The copy differs from the input by exactly one byte.
 */
export function patchCofEvent(buf: Buffer, frame: number, value: number, name = 'cof'): Buffer {
  const info = parseCof(buf, name);
  if (!Number.isInteger(frame) || frame < 0 || frame >= info.framesPerDirection) {
    throw new Error(
      `${name}: trigger frame ${frame} out of range (0..${info.framesPerDirection - 1})`
    );
  }
  if (!Number.isInteger(value) || value < 0 || value > 4) {
    throw new Error(`${name}: invalid frame event value ${value} (expected 0-4)`);
  }
  const out = Buffer.from(buf);
  out[info.triggerOffset + frame] = value;
  return out;
}
