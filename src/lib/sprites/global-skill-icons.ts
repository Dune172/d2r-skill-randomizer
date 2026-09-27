import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

export interface GlobalSkillIcon {
  skill: string;
  charclass: string;
  iconCel: number;
}

const SOURCE_CLASSES: Record<string, { folder: string; prefix: string }> = {
  sor: { folder: 'Sorceress', prefix: 'so' },
  nec: { folder: 'Necro', prefix: 'ne' },
  pal: { folder: 'Paladin', prefix: 'pa' },
  war: { folder: 'Warlock', prefix: 'wa' },
};
const ROOT = path.join(process.cwd(), 'data', 'sprites');

function spriteLayout(buffer: Buffer) {
  if (buffer.length < 40 || buffer.toString('ascii', 0, 4) !== 'SpA1') throw new Error('Invalid global icon sprite');
  const count = buffer.readUInt32LE(20);
  const totalWidth = buffer.readUInt32LE(8);
  const height = buffer.readUInt32LE(12);
  // Native sheets have a padded cell pitch: 132px HD, 67px lowend.
  // The 16-bit field at offset 6 is NOT their horizontal cell pitch.
  const width = totalWidth / count;
  if (!Number.isInteger(width) || width <= 0 || height <= 0 || count % 2 ||
      buffer.length !== 40 + totalWidth * height * 4) throw new Error('Invalid global icon sprite dimensions');
  return { count, width, height, totalWidth };
}

function appendSprite(base: Buffer, additions: Buffer[]): Buffer {
  const { count, width, height, totalWidth } = spriteLayout(base);
  const newCount = count + additions.length;
  const newWidth = newCount * width;
  const out = Buffer.alloc(40 + newWidth * height * 4);
  base.copy(out, 0, 0, 40);
  out.writeUInt32LE(newWidth, 8);
  out.writeUInt32LE(newCount, 20);
  out.writeUInt32LE(out.length - 40, 32);
  for (let y = 0; y < height; y++) {
    // Preserve every original utility pixel and its index, including reserved frames.
    base.copy(out, 40 + y * newWidth * 4, 40 + y * totalWidth * 4, 40 + (y + 1) * totalWidth * 4);
    additions.forEach((frame, i) => {
      if (frame.length !== width * height * 4) throw new Error('Invalid appended icon dimensions');
      frame.copy(out, 40 + (y * newWidth + (count + i) * width) * 4, y * width * 4, (y + 1) * width * 4);
    });
  }
  return out;
}

function dc6Frames(buffer: Buffer): Buffer[] {
  if (buffer.length < 24 || buffer.readUInt32LE(0) !== 6 || buffer.readUInt32LE(16) !== 1) {
    throw new Error('Expected a single-direction DC6 icon sheet');
  }
  const count = buffer.readUInt32LE(20);
  const frames: Buffer[] = [];
  if (buffer.length < 24 + count * 4) throw new Error('Truncated DC6 pointer table');
  for (let i = 0; i < count; i++) {
    const start = buffer.readUInt32LE(24 + i * 4);
    const end = i + 1 < count ? buffer.readUInt32LE(28 + i * 4) : buffer.length;
    if (start < 24 + count * 4 || end < start + 35 || end > buffer.length ||
        start + 32 + buffer.readUInt32LE(start + 28) + 3 > end) throw new Error('Invalid DC6 frame bounds');
    frames.push(Buffer.from(buffer.subarray(start, end)));
  }
  return frames;
}

function buildDc6(base: Buffer, frames: Buffer[]): Buffer {
  let offset = 24 + frames.length * 4;
  const out = Buffer.alloc(offset + frames.reduce((size, frame) => size + frame.length, 0));
  base.copy(out, 0, 0, 24);
  out.writeUInt32LE(frames.length, 20);
  frames.forEach((frame, i) => {
    out.writeUInt32LE(offset, 24 + i * 4);
    frame.copy(out, offset);
    // NextBlock is absolute, so relocating compressed frames must fix it too.
    out.writeUInt32LE(offset + frame.length, offset + 24);
    offset += frame.length;
  });
  return out;
}

function blankDc6Frame(): Buffer {
  const frame = Buffer.alloc(32 + 48 * 2 + 3);
  frame.writeUInt32LE(48, 4);
  frame.writeUInt32LE(48, 8);
  frame.writeUInt32LE(48 * 2, 28);
  for (let y = 0; y < 48; y++) {
    frame[32 + y * 2] = 0xb0; // skip 48 transparent pixels
    frame[33 + y * 2] = 0x80; // end scanline
  }
  frame.fill(0xcd, frame.length - 3);
  return frame;
}

/** Append class skill artwork to the shared sheets used by classless oskills. */
export async function buildGlobalSkillIcons(icons: readonly GlobalSkillIcon[]): Promise<{
  files: Map<string, Buffer>;
  iconCels: Map<string, number>;
}> {
  if (new Set(icons.map(icon => icon.skill)).size !== icons.length) throw new Error('Duplicate global spell icon');
  const baseDir = path.join(ROOT, 'global-skills');
  const high = fs.readFileSync(path.join(baseDir, 'skillicon.sprite'));
  const low = fs.readFileSync(path.join(baseDir, 'skillicon.lowend.sprite'));
  const legacy = fs.readFileSync(path.join(baseDir, 'skillicon.dc6'));
  const highLayout = spriteLayout(high);
  const lowLayout = spriteLayout(low);
  if (highLayout.count !== lowLayout.count) throw new Error('Global icon sheets have different frame counts');
  const start = highLayout.count;
  const iconCels = new Map(icons.map((icon, i) => [icon.skill, start + i * 2]));
  const legacyFrames = dc6Frames(legacy);
  if (legacyFrames.length > start) throw new Error('Legacy utility icons overlap the spell catalogue');
  // Original legacy sheet has 24 frames; HD has 40. Reserve the difference so
  // both graphics modes use exactly the same new IconCel values.
  while (legacyFrames.length < start) legacyFrames.push(blankDc6Frame());
  const highFrames: Buffer[] = [];
  const lowFrames: Buffer[] = [];
  const legacyClasses = new Map<string, Buffer[]>();
  for (const icon of icons) {
    const source = SOURCE_CLASSES[icon.charclass];
    if (!source || !Number.isInteger(icon.iconCel) || icon.iconCel < 0 || icon.iconCel % 2) {
      throw new Error(`Unsupported icon source for ${icon.skill}`);
    }
    let classic = legacyClasses.get(icon.charclass);
    if (!classic) {
      classic = dc6Frames(fs.readFileSync(path.join(baseDir, `${source.prefix}skillicon.dc6`)));
      legacyClasses.set(icon.charclass, classic);
    }
    for (const cel of [icon.iconCel, icon.iconCel + 1]) {
      const file = path.join(ROOT, 'icons', source.folder, `${source.folder}_${cel}.bmp`);
      // Fail on missing artwork: never silently ship an invisible skill button.
      const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      if (info.width !== highLayout.width || info.height !== highLayout.height || !classic[cel]) {
        throw new Error(`Unexpected icon source dimensions/frame for ${icon.skill}`);
      }
      highFrames.push(data);
      lowFrames.push(await sharp(file).resize(lowLayout.width, lowLayout.height, { fit: 'fill' }).ensureAlpha().raw().toBuffer());
      legacyFrames.push(classic[cel]);
    }
  }
  return {
    iconCels,
    files: new Map([
      ['hd/global/ui/spells/submenu/skillicon.sprite', appendSprite(high, highFrames)],
      ['hd/global/ui/spells/submenu/skillicon.lowend.sprite', appendSprite(low, lowFrames)],
      ['global/ui/spells/skillicon.dc6', buildDc6(legacy, legacyFrames)],
    ]),
  };
}
