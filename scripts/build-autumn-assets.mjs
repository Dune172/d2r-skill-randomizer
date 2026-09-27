#!/usr/bin/env node
// Builds the Autumn Towns pumpkin / jack-o'-lantern HD assets (offline).
//
//   node scripts/build-autumn-assets.mjs --d2rpp <path to d2rpp.exe> [--out data/sprites/autumn]
//
// Meshes are generated procedurally as OBJ, textures are painted in code and
// encoded to D2R's BC3 .texture format (scripts/lib/d2r-texture.mjs), and the
// models are built by transplanting the mesh into a vanilla prop model
// (scripts/lib/gr2patch.py) using d2rpp.exe, the Granny preprocessor that ships
// with Bonesy's D2R MoPaH (d2rmodding.com/modtools), for Decompress,
// RenameElement and Compress. d2rpp, python and the template (a vanilla model
// from a CASC extraction, --template) are only needed here; the generator
// ships the committed output.
//
// Conventions (checked against vanilla jar_candle01): Y-up, counter-clockwise
// winding, OBJ-style UVs here (row = 1 - v; gr2patch stores V top-down).
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { buildBC3Texture } from './lib/d2r-texture.mjs';
import { convert, DEFAULT_TEMPLATE } from './lib/model-transplant.mjs';

const require = createRequire(import.meta.url);
const sharp = require('sharp');

const args = process.argv.slice(2);
const arg = (name, fallback) => { const i = args.indexOf(`--${name}`); return i === -1 ? fallback : args[i + 1]; };
const OUT = path.resolve(arg('out', 'data/autumn/assets'));
const D2RPP = arg('d2rpp', '');
const TEX = 512;

// In-game texture paths the models point at. Our own folder, so no vanilla
// texture is touched.
export const TEXTURE_PATHS = {
  pumpkin: 'data/hd/d2rr/autumn/pumpkin_alb.texture',
  jack: 'data/hd/d2rr/autumn/jack_o_lantern_alb.texture',
};

// ── UV atlas regions (v measured OBJ-style, 0 = bottom row) ──────────────────
const BODY = { v0: 0.2, v1: 1.0 };     // outer skin, top of texture
const STEM = { v0: 0.1, v1: 0.2 };
const FLESH = { v0: 0.0, v1: 0.1 };    // jack-o'-lantern inner wall

// ── Mesh ─────────────────────────────────────────────────────────────────────
const RX = 0.42, RY = 0.27, CY = 0.27; // squat body, sitting on y = 0
const LOBES = 10;

// Grid sample positions. The plain pumpkin is uniform; the jack-o'-lantern's
// outer skin is densified around the face so the carved edges stay crisp.
const uniform = (n, max) => Array.from({ length: n + 1 }, (_, i) => (i / n) * max);
function adaptive(max, fine, coarse, lo, hi) {
  const out = [0];
  while (out[out.length - 1] < max - 1e-9) {
    const x = out[out.length - 1];
    out.push(Math.min(max, x + (x >= lo && x < hi ? fine : coarse)));
  }
  return out;
}

function bodyPoint(theta, phi, scale = 1) {
  // phi: 0 at top pole, PI at bottom pole.
  const s = Math.sin(phi);
  const groove = Math.pow(1 - Math.abs(Math.sin((LOBES / 2) * theta)), 3);
  const lobe = 1 - 0.075 * groove * Math.min(1, s * 1.6);
  // Pull both poles in to make the stem dimple and the flat base.
  const top = 1 - 0.42 * Math.exp(-((phi / 0.42) ** 2));
  const bottom = 1 - 0.25 * Math.exp(-(((Math.PI - phi) / 0.5) ** 2));
  const r = RX * lobe * s * scale;
  const y = CY + RY * Math.cos(phi) * (Math.cos(phi) > 0 ? top : bottom) * scale;
  return [r * Math.cos(theta), y, r * Math.sin(theta)];
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = v => { const l = Math.hypot(...v) || 1; return v.map(x => x / l); };

// Face cut-outs for the jack-o'-lantern, in (theta, phi) space. theta = PI/2
// faces +Z; placement yaw turns it toward the camera.
const FACE_CENTER = Math.PI / 2;
const tri = (a, b, c) => ({ pts: [a, b, c] });
const FACE = [
  tri([-0.52, 1.05], [-0.18, 1.05], [-0.34, 0.78]),   // left eye (dt, phi)
  tri([0.18, 1.05], [0.52, 1.05], [0.34, 0.78]),      // right eye
  tri([-0.09, 1.34], [0.09, 1.34], [0, 1.18]),        // nose
];
// Jagged mouth: a band with teeth.
function inMouth(dt, phi) {
  if (Math.abs(dt) > 0.62) return false;
  const top = 1.46 + 0.1 * (dt / 0.62) ** 2 * -1;     // smile curves up at the ends
  const bottom = 1.78 - 0.16 * (dt / 0.62) ** 2;
  if (phi < top || phi > bottom) return false;
  // Two teeth: one hanging from the top, one rising from the bottom.
  if (Math.abs(dt - 0.22) < 0.07 && phi < top + 0.12) return false;
  if (Math.abs(dt + 0.2) < 0.07 && phi > bottom - 0.12) return false;
  return true;
}
function inTri(p, [a, b, c]) {
  const s = (p1, p2, p3) => (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1]);
  const d1 = s(p, a, b), d2 = s(p, b, c), d3 = s(p, c, a);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}
function isCarved(theta, phi) {
  let dt = theta - FACE_CENTER;
  if (dt > Math.PI) dt -= 2 * Math.PI;
  if (dt < -Math.PI) dt += 2 * Math.PI;
  return FACE.some(f => inTri([dt, phi], f.pts)) || inMouth(dt, phi);
}

function buildMesh({ carved }) {
  const v = [], vt = [], vn = [], f = [];
  const add = (p, uv, n) => { v.push(p); vt.push(uv); vn.push(n); return v.length; };

  // Shell grid: (NU + 1) columns so the seam gets its own UVs.
  function shell(scale, inward, region, thetas, phis) {
    const NU = thetas.length - 1, NV = phis.length - 1;
    const idx = [];
    for (let j = 0; j <= NV; j++) {
      const phi = phis[j];
      const row = [];
      for (let i = 0; i <= NU; i++) {
        const theta = thetas[i];
        const p = bodyPoint(theta, phi, scale);
        const e = 1e-3;
        const du = sub(bodyPoint(theta + e, phi, scale), bodyPoint(theta - e, phi, scale));
        const dv = sub(bodyPoint(theta, Math.min(Math.PI, phi + e), scale), bodyPoint(theta, Math.max(0, phi - e), scale));
        let n = norm(cross(du, dv));
        if (j === 0) n = [0, 1, 0];
        if (j === NV) n = [0, -1, 0];
        if (inward) n = n.map(x => -x);
        const uv = [theta / (2 * Math.PI), region.v1 - (phi / Math.PI) * (region.v1 - region.v0)];
        row.push(add(p, uv, n));
      }
      idx.push(row);
    }
    for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
      const a = idx[j][i], b = idx[j][i + 1], c = idx[j + 1][i + 1], d = idx[j + 1][i];
      const theta = (thetas[i] + thetas[i + 1]) / 2, phi = (phis[j] + phis[j + 1]) / 2;
      if (!inward && carved && isCarved(theta, phi)) continue;
      // Counter-clockwise around the vertex normal, as in vanilla models
      // (every jar_candle01 face agrees with its normals in OBJ order).
      if (inward) { f.push([a, c, b]); f.push([a, d, c]); }
      else { f.push([a, b, c]); f.push([a, c, d]); }
    }
  }
  if (carved) {
    const T = 2 * Math.PI;
    shell(1, false, BODY,
      adaptive(T, T / 200, T / 48, FACE_CENTER - 0.75, FACE_CENTER + 0.75),
      adaptive(Math.PI, Math.PI / 100, Math.PI / 24, 0.7, 1.9));
    shell(0.9, true, FLESH, uniform(32, T), uniform(16, Math.PI));
  } else {
    shell(1, false, BODY, uniform(56, 2 * Math.PI), uniform(28, Math.PI));
  }

  // Curved stem: a tapered 8-sided tube rising out of the top dimple.
  const SEG = 8, RINGS = 6, base = bodyPoint(0, 0)[1] - 0.02;
  const rings = [];
  for (let k = 0; k <= RINGS; k++) {
    const t = k / RINGS;
    const cx = 0.035 * t * t, cy = base + 0.13 * t, r = 0.045 - 0.017 * t;
    const ring = [];
    for (let s = 0; s <= SEG; s++) {
      const a = (s / SEG) * 2 * Math.PI;
      const n = [Math.cos(a), 0, Math.sin(a)];
      ring.push(add([cx + r * n[0], cy, r * n[2]], [s / SEG, STEM.v0 + t * (STEM.v1 - STEM.v0)], n));
    }
    rings.push(ring);
  }
  for (let k = 0; k < RINGS; k++) for (let s = 0; s < SEG; s++) {
    const a = rings[k][s], b = rings[k][s + 1], c = rings[k + 1][s + 1], d = rings[k + 1][s];
    f.push([a, c, b]); f.push([a, d, c]);
  }
  const cap = add([0.035, base + 0.13, 0], [0.5, STEM.v1], [0, 1, 0]);
  for (let s = 0; s < SEG; s++) f.push([cap, rings[RINGS][s + 1], rings[RINGS][s]]);

  const lines = [`# D2RR autumn ${carved ? "jack-o'-lantern" : 'pumpkin'} — generated by scripts/build-autumn-assets.mjs`];
  for (const p of v) lines.push(`v ${p.map(x => x.toFixed(6)).join(' ')}`);
  for (const t of vt) lines.push(`vt ${t.map(x => x.toFixed(6)).join(' ')}`);
  for (const n of vn) lines.push(`vn ${n.map(x => x.toFixed(6)).join(' ')}`);
  lines.push(`g ${carved ? 'jack_o_lantern' : 'pumpkin'}`);
  for (const t of f) lines.push(`f ${t.map(i => `${i}/${i}/${i}`).join(' ')}`);
  return { obj: lines.join('\n') + '\n', verts: v.length, tris: f.length };
}

// ── Texture ──────────────────────────────────────────────────────────────────
function hash(x, y) { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
function smoothNoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const s = t => t * t * (3 - 2 * t);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * s(xf) + (c - a) * s(yf) + (a - b - c + d) * s(xf) * s(yf);
}
const fbm = (x, y) => 0.5 * smoothNoise(x, y) + 0.25 * smoothNoise(2 * x, 2 * y) + 0.125 * smoothNoise(4 * x, 4 * y);
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

function paint({ carved }) {
  const rgba = Buffer.alloc(TEX * TEX * 4);
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) {
    const u = (x + 0.5) / TEX, v = 1 - (y + 0.5) / TEX;
    let c;
    if (v >= BODY.v0) {
      const t = (BODY.v1 - v) / (BODY.v1 - BODY.v0);          // 0 top pole .. 1 bottom pole
      const g = Math.abs(Math.sin(LOBES / 2 * u * 2 * Math.PI)); // 0 in grooves, 1 mid-lobe
      const grain = fbm(u * 60, t * 8) - 0.5;
      c = mix([150, 58, 12], [232, 118, 26], Math.pow(g, 0.6));
      c = mix(c, [246, 150, 48], Math.max(0, grain) * 0.6 * g);
      // Faint vertical ribbing streaks along each lobe.
      c = c.map(ch => ch * (0.93 + 0.07 * Math.sin(u * 2 * Math.PI * 70 + fbm(u * 20, t * 3) * 4)));
      // Stem scar at the top, dry greenish base at the bottom.
      if (t < 0.12) c = mix([112, 96, 44], c, t / 0.12);
      if (t > 0.9) c = mix(c, [120, 88, 40], (t - 0.9) / 0.1);
      // A few darker blemishes.
      const spot = fbm(u * 25 + 7, t * 12 + 3);
      if (spot > 0.72) c = mix(c, [120, 50, 14], Math.min(1, (spot - 0.72) * 6));
    } else if (v >= STEM.v0) {
      const t = (v - STEM.v0) / (STEM.v1 - STEM.v0);
      const fib = 0.8 + 0.2 * Math.sin(u * 2 * Math.PI * 24 + fbm(u * 10, t * 4) * 3);
      c = mix([86, 92, 40], [128, 110, 64], t).map(ch => ch * fib);
    } else {
      // Carved inner wall: pale, bright flesh so the candle light reads as glow.
      const n = fbm(u * 30, v * 200);
      c = mix([255, 196, 92], [250, 226, 150], n);
    }
    const i = (y * TEX + x) * 4;
    rgba[i] = Math.max(0, Math.min(255, Math.round(c[0])));
    rgba[i + 1] = Math.max(0, Math.min(255, Math.round(c[1])));
    rgba[i + 2] = Math.max(0, Math.min(255, Math.round(c[2])));
    rgba[i + 3] = 255;
  }
  return rgba;
}

// ── OBJ -> .model (template transplant, scripts/lib/model-transplant.mjs) ────
const TEMPLATE = arg('template', DEFAULT_TEMPLATE);

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const work = fs.mkdtempSync(path.join(OUT, '.work-'));
  try {
    for (const kind of ['pumpkin', 'jack']) {
      const carved = kind === 'jack';
      const mesh = buildMesh({ carved });
      const objName = `${kind}.obj`;
      fs.writeFileSync(path.join(OUT, objName), mesh.obj);
      fs.copyFileSync(path.join(OUT, objName), path.join(work, objName));
      const rgba = paint({ carved });
      await sharp(rgba, { raw: { width: TEX, height: TEX, channels: 4 } }).png().toFile(path.join(OUT, `${kind}_alb.png`));
      fs.writeFileSync(path.join(OUT, `${kind}_alb.texture`), buildBC3Texture(rgba, TEX, TEX));
      if (D2RPP) convert({ d2rpp: D2RPP, template: TEMPLATE, objFile: objName, albedoPath: TEXTURE_PATHS[kind], modelFile: path.join(OUT, `${kind}_lod0.model`), work });
      console.log(`${kind}: ${mesh.verts} verts, ${mesh.tris} tris${D2RPP ? ', model built' : ' (no --d2rpp: model skipped)'}`);
    }
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
