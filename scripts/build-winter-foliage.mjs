#!/usr/bin/env node
// Frosts Act 1 tree and bush leaf textures for winter (offline) and writes
// them to data/winter/foliage/, plus a preview.
//
//   node scripts/build-winter-foliage.mjs [--src D:/D2RModding/data/data]
//
// Same textures and rules as build-autumn-foliage.mjs: output keeps vanilla
// resolution and mip count (downscaled overrides render as solid polygon
// blobs), and only leaf pixels (alpha-tested cut-outs, green-ish hue) change;
// twigs and branches (brown) are kept. Leaves lose most of their colour,
// cool toward a grey-green, and a low-frequency noise lifts patches of them to
// pale blue-white frost so a tree reads as rimed rather than painted white.
// The fallen-leaf ground decals are dulled and frosted the same way.
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { parseTexture, decodeBC3, buildBC3Texture, halve } from './lib/d2r-texture.mjs';

const sharp = createRequire(import.meta.url)('sharp');
const args = process.argv.slice(2);
const arg = (name, fallback) => { const i = args.indexOf(`--${name}`); return i === -1 ? fallback : args[i + 1]; };
const SRC = arg('src', 'D:/D2RModding/data/data');
const SIZE = Number(arg('size', 4096)); // default: keep vanilla resolution
const OUT = 'data/winter/foliage';
const TEX = 'hd/env/foliage/act1/texture';

// frost: how much of the canopy turns pale (noise threshold), keep: leftover
// saturation of the leaves that stay green.
const STYLES = {
  canopy: { frost: 0.38, keep: 0.28, seedShift: 0 },
  bush: { frost: 0.36, keep: 0.32, seedShift: 3 },
  fallen: { frost: 0.3, keep: 0.3, seedShift: 5, all: true },
};
// Names are relative to hd/env/foliage/act1/texture; the output keeps the
// basename, and the overlay builder maps it back to the vanilla path.
export const FOLIAGE = [
  ...[1, 2, 3, 4, 5, 6].map(n => [`act1_tree_canopy_maple0${n}`, 'canopy']),
  ...[1, 2, 3, 4, 5].map(n => [`act1_bush_hawthorn0${n}`, 'bush']),
  ...[1, 2, 3, 4].map(n => [`act1_bush_witchhazel0${n}`, 'bush']),
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
const clamp01 = x => Math.max(0, Math.min(1, x));

function frost(px, w, h, style, seed) {
  const out = Buffer.from(px);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (px[i + 3] < 16) continue;
    const [hue, s, v] = rgb2hsv(px[i] / 255, px[i + 1] / 255, px[i + 2] / 255);
    // Leaf weight: full for greens, fading through yellow-green; browns kept
    // (the fallen-leaf decals are frosted whatever their colour).
    const leaf = style.all ? 1
      : clamp01((hue - 38) / 22) * clamp01((175 - hue) / 30) * Math.min(1, s * 3);
    if (leaf <= 0) continue;
    const n = 0.7 * noise(x / 80, y / 80, seed) + 0.3 * noise(x / 18, y / 18, seed + 7);
    const f = clamp01((n - style.frost) / 0.3) * leaf;
    // Dull, cooled leaf first, then frost on top.
    let h2 = hue + (140 - hue) * 0.35 * leaf;
    let s2 = s * (1 - (1 - style.keep) * leaf);
    let v2 = v * (1 - 0.08 * leaf);
    h2 += (205 - h2) * f;
    s2 *= 1 - 0.85 * f;
    v2 += (0.84 - v2) * 0.85 * f;
    const [r, g, b] = hsv2rgb(h2, s2, v2);
    out[i] = Math.round(r * 255); out[i + 1] = Math.round(g * 255); out[i + 2] = Math.round(b * 255);
  }
  return out;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const previews = [];
  let total = 0;
  for (const [[name, kind], idx] of FOLIAGE.map((f, i) => [f, i])) {
    const buf = fs.readFileSync(`${SRC}/${TEX}/${name}_alb.texture`);
    const t = parseTexture(buf);
    let img = { rgba: decodeBC3(buf, t.levels[0].offset, t.width, t.height), width: t.width, height: t.height };
    img.rgba = frost(img.rgba, img.width, img.height, STYLES[kind], idx + 11 + STYLES[kind].seedShift);
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
