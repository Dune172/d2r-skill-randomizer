import { SpriteHeader } from '../randomizer/types';
import { SPRITE_HEADER_SIZE } from '../randomizer/config';

/**
 * Parse SpA1 sprite header from a Buffer
 */
export function parseSpriteHeader(buf: Buffer): SpriteHeader {
  const magic = buf.toString('ascii', 0, 4);
  if (magic !== 'SpA1') {
    throw new Error(`Invalid sprite magic: ${magic}`);
  }

  return {
    magic,
    version: buf.readUInt16LE(4),
    frameWidth: buf.readUInt16LE(6),
    totalWidth: buf.readUInt32LE(8),
    height: buf.readUInt32LE(12),
    frameCount: buf.readUInt32LE(20),
    headerSize: SPRITE_HEADER_SIZE,
    rawHeader: Buffer.from(buf.subarray(0, SPRITE_HEADER_SIZE)),
  };
}

/**
 * Extract a single frame from a sprite as raw RGBA buffer.
 * Sprite pixel data is stored row by row, with all frames interleaved in each row.
 * For row Y, frame N starts at: headerSize + (Y * totalWidth + N * frameWidth) * 4
 */
export function extractFrame(buf: Buffer, header: SpriteHeader, frameIndex: number): Buffer {
  const { frameWidth, totalWidth, height, headerSize } = header;
  const frameBuf = Buffer.alloc(frameWidth * height * 4);

  for (let y = 0; y < height; y++) {
    const srcOffset = headerSize + (y * totalWidth + frameIndex * frameWidth) * 4;
    const dstOffset = y * frameWidth * 4;
    buf.copy(frameBuf, dstOffset, srcOffset, srcOffset + frameWidth * 4);
  }

  return frameBuf;
}

/**
 * Build a SpA1 sprite from multiple frames.
 * All frames must have the same width and height.
 */
export function buildSprite(
  frames: Buffer[],
  frameWidth: number,
  height: number,
  version: number = 31,
): Buffer {
  const frameCount = frames.length;
  const totalWidth = frameWidth * frameCount;
  const headerSize = SPRITE_HEADER_SIZE;

  // Build header
  const header = Buffer.alloc(headerSize);
  header.write('SpA1', 0, 4, 'ascii');
  header.writeUInt16LE(version, 4);
  header.writeUInt16LE(frameWidth, 6);
  header.writeUInt32LE(totalWidth, 8);
  header.writeUInt32LE(height, 12);
  // Bytes 16-19: unknown (0)
  header.writeUInt32LE(frameCount, 20);
  // Bytes 24-39: unknown/padding (0)

  // Build pixel data - interleave frames row by row
  const pixelDataSize = totalWidth * height * 4;
  const pixelData = Buffer.alloc(pixelDataSize);

  for (let y = 0; y < height; y++) {
    for (let f = 0; f < frameCount; f++) {
      const srcOffset = y * frameWidth * 4;
      const dstOffset = (y * totalWidth + f * frameWidth) * 4;
      frames[f].copy(pixelData, dstOffset, srcOffset, srcOffset + frameWidth * 4);
    }
  }

  return Buffer.concat([header, pixelData]);
}

/**
 * Build a sprite from frames with potentially different heights.
 * Pads shorter frames with transparent pixels at the bottom.
 */
export function buildSpriteWithPadding(
  frames: { data: Buffer; width: number; height: number }[],
  targetWidth: number,
  targetHeight: number,
  version: number = 31,
): Buffer {
  const paddedFrames: Buffer[] = [];

  for (const frame of frames) {
    if (frame.height === targetHeight && frame.width === targetWidth) {
      paddedFrames.push(frame.data);
    } else {
      // Create padded frame
      const padded = Buffer.alloc(targetWidth * targetHeight * 4); // zeroed = transparent
      for (let y = 0; y < Math.min(frame.height, targetHeight); y++) {
        const srcOffset = y * frame.width * 4;
        const dstOffset = y * targetWidth * 4;
        const copyWidth = Math.min(frame.width, targetWidth) * 4;
        frame.data.copy(padded, dstOffset, srcOffset, srcOffset + copyWidth);
      }
      paddedFrames.push(padded);
    }
  }

  return buildSprite(paddedFrames, targetWidth, targetHeight, version);
}
