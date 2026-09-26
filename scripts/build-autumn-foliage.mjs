#!/usr/bin/env node
// Recolours Act 1 tree and bush leaf textures to autumn (offline) and writes
// them to data/autumn/foliage/, plus a preview.
//
//   node scripts/build-autumn-foliage.mjs [--src D:/D2RModding/data/data]
//
// Output keeps vanilla resolution and mip count: the engine trusts its own
// texture metadata, and downscaled overrides render as solid polygon blobs.
//
// Only leaf atlases are touched: vanilla oak canopies are already autumn
// brown-orange and bark textures stay as they are. Leaf pixels (alpha-tested
// cut-outs, green-ish hue) are rotated toward a per-species palette; a low-
// frequency noise picks where in the palette each leaf cluster lands so a tree
// reads as mixed reds, oranges and golds. Twigs and branches (brown) are kept.
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { parseTexture, decodeBC3, buildBC3Texture, halve } from './lib/d2r-texture.mjs';

const sharp = createRequire(import.meta.url)('sharp');
const args = process.argv.slice(2);
const arg = (name, fallback) => { const i = args.indexOf(`--${name}`); return i === -1 ? fallback : args[i + 1]; };
const SRC = arg('src', 'D:/D2RModding/data/data');
const SIZE = Number(arg('size', 4096)); // default: keep vanilla resolution
const OUT = 'data/autumn/foliage';
const TEX = 'hd/env/foliage/act1/texture';

// Palette: hue range (degrees) the noise sweeps across, saturation boost.
const PALETTES = {
  maple: { hues: [4, 18, 30, 42], sat: 1.25 },
  hawthorn: { hues: [0, 8, 20], sat: 1.2 },
  witchhazel: { hues: [28, 38, 46], sat: 1.2 },
  linden: { hues: [40, 48, 54], sat: 1.15 },
  birch: { hues: [42, 50, 56], sat: 1.15 },
  elm: { hues: [30, 38, 46], sat: 1.1 },
  shrub: { hues: [16, 24, 32], sat: 1.0 },
  bonsai: { hues: [6, 16, 26], sat: 1.2 },
  vines: { hues: [2, 12, 24], sat: 1.2 },
  fallen: { hues: [8, 20, 32, 44], sat: 1.1 },
};
// Names are relative to hd/env/foliage/act1/texture; the output keeps the
// basename, and the generator maps it back to the vanilla path.
export const FOLIAGE = [
  // Species that are green in vanilla, where the change shows most (download
  // budget, chosen after playtest). Oak is already autumn; elm, linden and
  // birch are already yellowish, so they keep their vanilla look.
  ...[1, 2, 3, 4, 5, 6].map(n => [`act1_tree_canopy_maple0${n}`, 'maple']),
  ...[1, 2, 3, 4, 5].map(n => [`act1_bush_hawthorn0${n}`, 'hawthorn']),
  ...[1, 2, 3, 4].map(n => [`act1_bush_witchhazel0${n}`, 'witchhazel']),
  // Fallen-leaf ground decals (leaves_green01 / leaves_scattered01 patches).
  ['../../../texture/global/decal/act1/act1_leaves01', 'fallen'],
  ['../../../texture/global/decal/act1/act1_leaves02', 'fallen'],
];

function hash(x, y, s) { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
function noise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, f = t => t * t * (3 - 2 * t);
  const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
  return a + (b - a) * f(xf) + (c - a) * f(yf) + (a - b - c + d) * f(xf) * f(yf);
}
function rgb2hsv(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, max ? d / max : 0, max];
}
function hsv2rgb(h, s, v) {
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [r + m, g + m, b + m];
}

function recolor(px, w, h, palette, seed) {
  const out = Buffer.from(px);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (px[i + 3] < 16) continue;
    const [hue, s, v] = rgb2hsv(px[i] / 255, px[i + 1] / 255, px[i + 2] / 255);
    // Leaf weight: full for greens, fading through yellow-green; browns kept.
    const w8 = Math.max(0, Math.min(1, (hue - 38) / 22)) * Math.max(0, Math.min(1, (175 - hue) / 30)) * Math.min(1, s * 3);
    if (w8 <= 0) continue;
    const n = 0.7 * noise(x / 90, y / 90, seed) + 0.3 * noise(x / 25, y / 25, seed + 7);
    const t = Math.min(0.999, Math.max(0, n)) * (palette.hues.length - 1);
    const k = Math.floor(t), target = palette.hues[k] + (palette.hues[k + 1] - palette.hues[k]) * (t - k);
    const h2 = hue + (target - hue) * w8;
    const s2 = Math.min(1, s + (Math.min(1, s * palette.sat + 0.08) - s) * w8);
    const v2 = Math.min(1, v * (1 + 0.06 * w8));
    const [r, g, b] = hsv2rgb(h2, s2, v2);
    out[i] = Math.round(r * 255); out[i + 1] = Math.round(g * 255); out[i + 2] = Math.round(b * 255);
  }
  return out;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const previews = [];
  let total = 0;
  for (const [[name, species], idx] of FOLIAGE.map((f, i) => [f, i])) {
    const buf = fs.readFileSync(`${SRC}/${TEX}/${name}_alb.texture`);
    const t = parseTexture(buf);
    let img = { rgba: decodeBC3(buf, t.levels[0].offset, t.width, t.height), width: t.width, height: t.height };
    img.rgba = recolor(img.rgba, img.width, img.height, PALETTES[species], idx + 11);
    while (img.width > SIZE) img = halve(img.rgba, img.width, img.height);
    const tex = buildBC3Texture(img.rgba, img.width, img.height);
    fs.writeFileSync(path.join(OUT, `${path.basename(name)}_alb.texture`), tex);
    total += tex.length;
    if (previews.length < 12) {
      const flat = Buffer.alloc(img.rgba.length);
      for (let i = 0; i < flat.length; i += 4) { const a = img.rgba[i + 3] / 255; for (let c = 0; c < 3; c++) flat[i + c] = img.rgba[i + c] * a + 70 * (1 - a); flat[i + 3] = 255; }
      previews.push(await sharp(flat, { raw: { width: img.width, height: img.height, channels: 4 } }).resize(256, 256).png().toBuffer());
    }
  }
  await sharp({ create: { width: 256 * 6, height: 256 * 2, channels: 3, background: '#000' } })
    .composite(previews.map((p, i) => ({ input: p, left: (i % 6) * 256, top: Math.floor(i / 6) * 256 }))).png().toFile(path.join(OUT, 'preview.png'));
  console.log(`${FOLIAGE.length} textures, ${(total / 1048576).toFixed(1)} MB`);
}

main().catch(e => { console.error(e); process.exit(1); });
