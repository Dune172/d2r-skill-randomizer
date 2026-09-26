// D2R HD .texture codec (offline tooling — the generator ships prebuilt output).
//
// Layout, verified against vanilla albedo/normal textures:
//   0   char[4] '<DE('
//   4   u8  format   (62 = BC3 albedo, 61 = BC5 normal)
//   5   u8  0
//   6   u8  2
//   7   u8  mip count
//   8   u32 width
//   12  u32 height
//   16  u32 depth (1)
//   20  u32 0, u32 0
//   28  u32 mip count
//   32  u32 4
//   36  mip table: per level { u32 byteSize, u32 offset } where offset is
//       relative to the offset field itself. Pixel data follows the table
//       (header = 36 + 8 * mips bytes), largest mip first, each level at least
//       one 4x4 block.

export const FORMAT_BC3 = 62;
export const FORMAT_BC5 = 61;
const MAGIC = '<DE(';

export function parseTexture(buf) {
  if (buf.toString('latin1', 0, 4) !== MAGIC) throw new Error('not a D2R .texture (bad magic)');
  const format = buf[4];
  const width = buf.readUInt32LE(8);
  const height = buf.readUInt32LE(12);
  const mips = buf.readUInt32LE(28);
  const levels = [];
  for (let i = 0; i < mips; i++) {
    const at = 36 + i * 8;
    levels.push({ size: buf.readUInt32LE(at), offset: at + 4 + buf.readUInt32LE(at + 4) });
  }
  return { format, width, height, mips, levels };
}

/** Serialise already-compressed mip levels (largest first) into a .texture file. */
export function writeTexture(format, width, height, levelData) {
  const mips = levelData.length;
  const headerSize = 36 + 8 * mips;
  const total = headerSize + levelData.reduce((n, l) => n + l.length, 0);
  const buf = Buffer.alloc(total);
  buf.write(MAGIC, 0, 'latin1');
  buf[4] = format; buf[5] = 0; buf[6] = 2; buf[7] = mips;
  buf.writeUInt32LE(width, 8);
  buf.writeUInt32LE(height, 12);
  buf.writeUInt32LE(1, 16);
  buf.writeUInt32LE(mips, 28);
  buf.writeUInt32LE(4, 32);
  let data = headerSize;
  levelData.forEach((level, i) => {
    const at = 36 + i * 8;
    buf.writeUInt32LE(level.length, at);
    buf.writeUInt32LE(data - (at + 4), at + 4);
    level.copy(buf, data);
    data += level.length;
  });
  return buf;
}

// ── BC3 (DXT5) ────────────────────────────────────────────────────────────────

const to565 = (r, g, b) => ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3);
const from565 = v => [((v >> 11) & 31) * 255 / 31 | 0, ((v >> 5) & 63) * 255 / 63 | 0, (v & 31) * 255 / 31 | 0];

function decodeColorBlock(src, o, out, stride, x0, y0) {
  const c0 = src.readUInt16LE(o), c1 = src.readUInt16LE(o + 2);
  const a = from565(c0), b = from565(c1);
  const pal = [a, b, a.map((v, i) => (2 * v + b[i]) / 3 | 0), a.map((v, i) => (v + 2 * b[i]) / 3 | 0)];
  const idx = src.readUInt32LE(o + 4);
  for (let p = 0; p < 16; p++) {
    const c = pal[(idx >>> (2 * p)) & 3];
    const px = ((y0 + (p >> 2)) * stride + x0 + (p & 3)) * 4;
    out[px] = c[0]; out[px + 1] = c[1]; out[px + 2] = c[2];
  }
}

function alphaPalette(a0, a1) {
  return a0 > a1
    ? [a0, a1, ...[1, 2, 3, 4, 5, 6].map(i => ((7 - i) * a0 + i * a1) / 7 | 0)]
    : [a0, a1, ...[1, 2, 3, 4].map(i => ((5 - i) * a0 + i * a1) / 5 | 0), 0, 255];
}

// The 48 index bits (3 per pixel) split cleanly into two 24-bit halves: pixels
// 0-7 in bytes 0-2 and pixels 8-15 in bytes 3-5. Plain integers, no BigInt.
function decodeAlphaBlock(src, o, out, stride, x0, y0, channel) {
  const pal = alphaPalette(src[o], src[o + 1]);
  const lo = src[o + 2] | (src[o + 3] << 8) | (src[o + 4] << 16);
  const hi = src[o + 5] | (src[o + 6] << 8) | (src[o + 7] << 16);
  for (let p = 0; p < 16; p++) {
    const bits = p < 8 ? lo >> (3 * p) : hi >> (3 * (p - 8));
    const px = ((y0 + (p >> 2)) * stride + x0 + (p & 3)) * 4;
    out[px + channel] = pal[bits & 7];
  }
}

/** Decode one BC3 level to RGBA8. */
export function decodeBC3(src, offset, width, height) {
  const out = Buffer.alloc(width * height * 4, 255);
  let o = offset;
  for (let by = 0; by < height; by += 4) for (let bx = 0; bx < width; bx += 4) {
    decodeAlphaBlock(src, o, out, width, bx, by, 3);
    decodeColorBlock(src, o + 8, out, width, bx, by);
    o += 16;
  }
  return out;
}

function encodeAlphaBlock(alphas, dst, o) {
  let lo = 255, hi = 0;
  for (let p = 0; p < 16; p++) { const a = alphas[p]; if (a < lo) lo = a; if (a > hi) hi = a; }
  dst[o] = hi; dst[o + 1] = lo;
  const pal = alphaPalette(hi, lo);
  let bitsLo = 0, bitsHi = 0;
  for (let p = 0; p < 16; p++) {
    let best = 0, err = Infinity;
    for (let i = 0; i < 8; i++) { const e = Math.abs(pal[i] - alphas[p]); if (e < err) { err = e; best = i; } }
    if (p < 8) bitsLo |= best << (3 * p); else bitsHi |= best << (3 * (p - 8));
  }
  dst[o + 2] = bitsLo & 255; dst[o + 3] = (bitsLo >> 8) & 255; dst[o + 4] = (bitsLo >> 16) & 255;
  dst[o + 5] = bitsHi & 255; dst[o + 6] = (bitsHi >> 8) & 255; dst[o + 7] = (bitsHi >> 16) & 255;
}

function encodeColorBlock(px, dst, o) {
  // Endpoints: extremes along the block's dominant axis (max-spread channel sum),
  // inset slightly to reduce banding. Good enough for procedural art.
  let mean = [0, 0, 0];
  for (const c of px) for (let i = 0; i < 3; i++) mean[i] += c[i] / 16;
  let axis = [0, 0, 0];
  for (const c of px) {
    const d = c.map((v, i) => v - mean[i]);
    const s = d[0] + d[1] + d[2] >= 0 ? 1 : -1;
    for (let i = 0; i < 3; i++) axis[i] += s * d[i];
  }
  const len = Math.hypot(...axis) || 1;
  axis = axis.map(v => v / len);
  let minP = Infinity, maxP = -Infinity, minC = px[0], maxC = px[0];
  for (const c of px) {
    const p = (c[0] - mean[0]) * axis[0] + (c[1] - mean[1]) * axis[1] + (c[2] - mean[2]) * axis[2];
    if (p < minP) { minP = p; minC = c; }
    if (p > maxP) { maxP = p; maxC = c; }
  }
  const inset = (a, b) => a.map((v, i) => Math.max(0, Math.min(255, Math.round(v + (b[i] - v) / 16))));
  let c0 = to565(...inset(maxC, minC)), c1 = to565(...inset(minC, maxC));
  if (c0 < c1) [c0, c1] = [c1, c0];
  dst.writeUInt16LE(c0, o); dst.writeUInt16LE(c1, o + 2);
  if (c0 === c1) { dst.writeUInt32LE(0, o + 4); return; }
  const a = from565(c0), b = from565(c1);
  const pal = [a, b, a.map((v, i) => (2 * v + b[i]) / 3), a.map((v, i) => (v + 2 * b[i]) / 3)];
  let idx = 0;
  px.forEach((c, p) => {
    let best = 0, err = Infinity;
    pal.forEach((q, i) => {
      const e = (c[0] - q[0]) ** 2 + (c[1] - q[1]) ** 2 + (c[2] - q[2]) ** 2;
      if (e < err) { err = e; best = i; }
    });
    idx |= best << (2 * p);
  });
  dst.writeUInt32LE(idx >>> 0, o + 4);
}

/** Encode one RGBA8 level (dimensions padded up to whole 4x4 blocks) to BC3. */
export function encodeBC3(rgba, width, height) {
  const bw = Math.max(1, Math.ceil(width / 4)), bh = Math.max(1, Math.ceil(height / 4));
  const dst = Buffer.alloc(bw * bh * 16);
  let o = 0;
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    const px = [], alphas = [];
    for (let p = 0; p < 16; p++) {
      const x = Math.min(width - 1, bx * 4 + (p & 3)), y = Math.min(height - 1, by * 4 + (p >> 2));
      const i = (y * width + x) * 4;
      px.push([rgba[i], rgba[i + 1], rgba[i + 2]]);
      alphas.push(rgba[i + 3]);
    }
    encodeAlphaBlock(alphas, dst, o);
    encodeColorBlock(px, dst, o + 8);
    o += 16;
  }
  return dst;
}

/** Box-filter an RGBA8 image down by 2 in each dimension. */
export function halve(rgba, width, height) {
  const w = Math.max(1, width >> 1), h = Math.max(1, height >> 1);
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 4; c++) {
    let s = 0;
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const sx = Math.min(width - 1, x * 2 + dx), sy = Math.min(height - 1, y * 2 + dy);
      s += rgba[(sy * width + sx) * 4 + c];
    }
    out[(y * w + x) * 4 + c] = Math.round(s / 4);
  }
  return { rgba: out, width: w, height: h };
}

/** Build a full-mip-chain BC3 .texture from a square power-of-two RGBA8 image. */
export function buildBC3Texture(rgba, width, height) {
  const levels = [];
  let cur = { rgba, width, height };
  for (;;) {
    levels.push(encodeBC3(cur.rgba, cur.width, cur.height));
    if (cur.width === 1 && cur.height === 1) break;
    cur = halve(cur.rgba, cur.width, cur.height);
  }
  return writeTexture(FORMAT_BC3, width, height, levels);
}
