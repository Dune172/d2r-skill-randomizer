#!/usr/bin/env node
// Assembles the Autumn Towns HD overlay (offline) into data/autumn/overlay.zip.
// Every file under it is copied verbatim into generated mods at data/<path>
// during October and November (src/lib/autumn). Nothing is computed per request.
//
//   node scripts/build-autumn-assets.mjs --d2rpp <d2rpp.exe>   -> data/autumn/assets
//   node scripts/build-autumn-foliage.mjs                      -> data/autumn/foliage
//   node scripts/build-autumn-town-props.mjs --bounds <cache>  -> data/autumn/town-props.json
//   node scripts/build-autumn-overlay.mjs [--src D:/D2RModding/data/data]
//
// Vanilla HD files (town presets, Act 1 outdoor biomes and lighting) are read
// from a CASC extraction (--src) and modified:
//   - town presets: pumpkins, jack-o'-lanterns (with candle flame + light),
//     corn stalks, from town-props.json. Visual-only entities, no collision.
//   - Act 1 outdoor biomes: straw-tinted grass, fallen-leaf clutter.
//   - their time-of-day lighting: autumn colour-grading LUT, warmer key light
//     and fog, stronger wind. (Screen-space drifting leaves were tried and
//     dropped in playtest: too much.)
//   - recoloured maple / hawthorn / witch hazel leaves and fallen-leaf decals.
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createRequire } from 'module';

const AdmZip = createRequire(import.meta.url)('adm-zip');

const args = process.argv.slice(2);
const arg = (name, fallback) => { const i = args.indexOf(`--${name}`); return i === -1 ? fallback : args[i + 1]; };
const SRC = arg('src', 'D:/D2RModding/data/data');
const OUT = 'data/autumn/overlay';   // working tree (gitignored)
const ZIP = 'data/autumn/overlay.zip'; // committed; loaded by src/lib/autumn/overlay.ts
fs.rmSync(OUT, { recursive: true, force: true });

const put = (rel, data) => { const p = path.join(OUT, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, data); };
// Vanilla files the overlay is derived from, with hashes: after a D2R patch
// verify-autumn --src flags any that changed, so the overlay gets rebuilt
// instead of shipping stale copies over patched game files.
const SOURCES = {};
const readVanilla = rel => {
  const buf = fs.readFileSync(`${SRC}/${rel}`);
  SOURCES[rel] = crypto.createHash('sha1').update(buf).digest('hex');
  return buf;
};
const readJson = rel => JSON.parse(readVanilla(rel).toString('utf8'));
const putJson = (rel, obj) => put(rel, JSON.stringify(obj));

// ── Models + textures ────────────────────────────────────────────────────────
// Unused vanilla test-model slots (hd/bvt/models, one LOD each): verified to
// load in game, unlike arbitrary new model paths which D2R may not register.
const M = {
  pumpkin: 'data/hd/bvt/models/blend_sphere.model',
  jack: 'data/hd/bvt/models/glass_sphere.model',
  corn: 'data/hd/env/foliage/global/model/expansion_corn_stalks/expansion_corn_stalk_large01.model',
  cornMed: 'data/hd/env/foliage/global/model/expansion_corn_stalks/expansion_corn_stalk_medium01.model',
};
put('hd/bvt/models/blend_sphere_lod0.model', fs.readFileSync('data/autumn/assets/pumpkin_lod0.model'));
put('hd/bvt/models/glass_sphere_lod0.model', fs.readFileSync('data/autumn/assets/jack_lod0.model'));
put('hd/d2rr/autumn/pumpkin_alb.texture', fs.readFileSync('data/autumn/assets/pumpkin_alb.texture'));
put('hd/d2rr/autumn/jack_o_lantern_alb.texture', fs.readFileSync('data/autumn/assets/jack_alb.texture'));
const TEX = ['data/hd/d2rr/autumn/pumpkin_alb.texture', 'data/hd/d2rr/autumn/jack_o_lantern_alb.texture',
  ...['ALB', 'B', 'NRM', 'ORM'].map(s => `data/hd/env/foliage/global/texture/expansion_corn_stalks_${s}.texture`)];
const PARTICLES = ['data/hd/vfx/particles/env/common/generic/vfx_candle_Flame.particles',
  'data/hd/vfx/particles/env/common/generic/vfx_candle_light.particles'];

for (const f of fs.readdirSync('data/autumn/foliage').filter(f => f.endsWith('.texture'))) {
  const dir = f.startsWith('act1_leaves') ? 'hd/env/texture/global/decal/act1' : 'hd/env/foliage/act1/texture';
  put(`${dir}/${f}`, fs.readFileSync(`data/autumn/foliage/${f}`));
}

// ── Entities ─────────────────────────────────────────────────────────────────
let nextId = 3900000000;
const quatYaw = deg => { const r = (deg * Math.PI) / 360; return { x: 0, y: Math.sin(r), z: 0, w: Math.cos(r) }; };
const transform = (name, [x, y, z], yaw = 0, s = 1) => ({ type: 'TransformDefinitionComponent', name: `${name}_TransformDefinitionComponent`,
  position: { x, y, z }, orientation: quatYaw(yaw), scale: { x: s, y: s, z: s }, inheritOnlyPosition: false });
const model = (name, filename) => ({ type: 'ModelDefinitionComponent', name: `${name}_ModelDefinitionComponent`, filename,
  visibleLayers: 1, lightMask: 19, shadowMask: 3, ghostShadows: false, floorModel: false, terrainBlendEnableYUpBlend: false, terrainBlendMode: 1 });
const vfx = (name, filename) => ({ type: 'VfxDefinitionComponent', name: `${name}_VfxDefinition`, filename, hardKillOnDestroy: false });
const entity = (name, components) => ({ type: 'Entity', name, id: nextId++, components });

function prop(kind, at, yaw, scale) {
  const n = `d2rr_${kind}_${nextId}`;
  const out = [entity(n, [transform(n, at, yaw, scale), model(n, M[kind])])];
  if (kind === 'jack') {
    // Candle inside: the flame low in the hollow, its light a little above.
    const [x, y, z] = at;
    out.push(entity(`${n}_flame`, [transform(`${n}_flame`, [x, y + 0.2 * scale, z]), vfx(`${n}_flame`, PARTICLES[0])]));
    out.push(entity(`${n}_light`, [transform(`${n}_light`, [x, y + 0.35 * scale, z]), vfx(`${n}_light`, PARTICLES[1])]));
  }
  return out;
}

// ── Act 1 outdoors: biome, lighting, LUT ─────────────────────────────────────
const LUT = 'data/hd/env/lut/d2rr_autumn.dds';
const LEAF_MODELS = ['leaves_yellow01', 'leaves_green01'].map(n => `data/hd/env/model/global/prop/act1/outdoors/act1_outdoors_leaves/${n}.model`);
const LEAF_TEX = ['act1_leaves01_alb', 'act1_leaves01_yellow_alb', 'act1_leaves01_nrm', 'act1_leaves01_orm']
  .map(n => `data/hd/env/texture/global/decal/act1/${n}.texture`);
const warm = (c, k) => { c.x = Math.min(1, c.x * (1 + 0.04 * k)); c.y *= 1 - 0.08 * k; c.z *= 1 - 0.22 * k; };

for (const biome of ['act1_outdoors', 'act1_tristram', 'act1_campfire']) {
  const b = readJson(`hd/env/biome/${biome}.json`);
  for (const v of b.visualDataFilenames) {
    const rel = v.visualDataFilename.slice(5);
    const vis = readJson(rel);
    const vd = vis.entities[0].components[0];
    const tod = rel.match(/_(\w+)\.json$/)[1];
    vd.gradingLutFile = LUT;
    if (vd.fogDiffuse) warm(vd.fogDiffuse, 1.2);
    vd.windScale = Math.max(vd.windScale ?? 0.5, 1.1);
    for (const e of vis.entities) for (const c of e.components)
      if (c.type === 'DirectionalLightDefinitionComponent' && e.name === 'global_key_light') warm(c.color, tod === 'night' ? 0.3 : 0.9);
    vis.dependencies.other = [...(vis.dependencies.other ?? []).filter(o => !o.path.includes('/lut/')), { path: LUT }];
    putJson(rel, vis);
  }
  for (const key of Object.keys(b)) if (key.startsWith('terrainData')) for (const layer of b[key].terrainLayers ?? []) {
    // GrassColor multiplies the grass texture: a muted straw tint.
    if (layer.GrassColor) Object.assign(layer.GrassColor, { x: 1.0, y: 0.86, z: 0.62 });
    if (/grass|moss/i.test(layer.Albedo ?? '')) {
      layer.Clutter = layer.Clutter ?? [];
      LEAF_MODELS.forEach((m, k) => layer.Clutter.push({ type: 'Clutter', name: `${layer.name}_d2rr_leaves_${k}`, ModelFilename: m,
        Density: 0.006, Scale: { x: 0.6, y: 1.1 }, Sink: { x: 0.0, y: 0.0 }, RotationMax: 180.0, IsFloorModel: false }));
    }
  }
  b.dependencies.models = [...(b.dependencies.models ?? []), ...LEAF_MODELS.map(p => ({ path: p }))];
  b.dependencies.textures = [...(b.dependencies.textures ?? []), ...LEAF_TEX.map(p => ({ path: p }))];
  putJson(`hd/env/biome/${biome}.json`, b);
}

{
  // 65^3 RGBA16F 3D LUT (vanilla header), r fastest. Only muted, darker,
  // yellow-green foliage tones slide toward autumn orange/gold; vivid or
  // bright greens (the poison tint on characters, poison effects, green UI-ish
  // highlights) are left alone. Everything gets a gentle warm grade.
  const hdr = readVanilla('hd/env/lut/default.dds').subarray(0, 128);
  const N = 65, buf = Buffer.alloc(128 + N * N * N * 8);
  hdr.copy(buf, 0);
  const f2h = v => { const f = new Float32Array([v]), i = new Uint32Array(f.buffer)[0]; const s = (i >> 16) & 0x8000, e = ((i >> 23) & 0xff) - 112, m = i & 0x7fffff; if (e <= 0) return s; if (e >= 31) return s | 0x7c00; return s | (e << 10) | (m >> 13); };
  const ramp = (x, from, to) => Math.max(0, Math.min(1, (x - from) / (to - from)));
  let o = 128;
  for (let bi = 0; bi < N; bi++) for (let gi = 0; gi < N; gi++) for (let ri = 0; ri < N; ri++) {
    let r = ri / 64, g = gi / 64, b = bi / 64;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, v = max, s = max ? d / max : 0;
    let h = 0;
    if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
    const hueW = Math.exp(-(((h - 80) / 24) ** 2)) * ramp(h, 105, 95);   // yellow-greens, none past ~105°
    const satW = Math.min(1, s * 2.5) * ramp(s, 0.62, 0.47);              // muted only
    const valW = ramp(v, 0.62, 0.42);                                     // darker only (lit characters are bright)
    const w = hueW * satW * valW * 0.95;
    const h2 = h + (26 - h) * w, s2 = s * (1 - 0.15 * w);
    const c = v * s2, x = c * (1 - Math.abs(((h2 / 60) % 2) - 1)), m = v - c;
    [r, g, b] = h2 < 60 ? [c, x, 0] : h2 < 120 ? [x, c, 0] : h2 < 180 ? [0, c, x] : h2 < 240 ? [0, x, c] : h2 < 300 ? [x, 0, c] : [c, 0, x];
    r = Math.min(1, (r + m) * 1.02); g = (g + m) * 0.98; b = (b + m) * 0.94;
    for (const val of [r, g, b, 1]) { buf.writeUInt16LE(f2h(val), o); o += 2; }
  }
  put(LUT.slice(5), buf);
}

// ── Town presets ─────────────────────────────────────────────────────────────
const PROPS = JSON.parse(fs.readFileSync('data/autumn/town-props.json', 'utf8'));
for (const [presetRel, props] of Object.entries(PROPS)) {
  const rel = `hd/env/preset/${presetRel}.json`;
  const p = readJson(rel);
  for (const q of props) p.entities.push(...prop(q.kind, [q.x, q.y, q.z], q.yaw, q.scale));
  const dep = (k, list) => { p.dependencies[k] = p.dependencies[k] ?? []; for (const x of list) if (!p.dependencies[k].some(d => d.path === x)) p.dependencies[k].push({ path: x }); };
  dep('models', Object.values(M));
  dep('textures', TEX);
  dep('particles', PARTICLES);
  putJson(rel, p);
}

let files = 0, bytes = 0;
const walk = d => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else { files++; bytes += fs.statSync(p).size; } } };
walk(OUT);
// Foliage recolours derive from vanilla textures too (build-autumn-foliage).
for (const f of fs.readdirSync('data/autumn/foliage').filter(f => f.endsWith('.texture')))
  readVanilla(f.startsWith('act1_leaves') ? `hd/env/texture/global/decal/act1/${f}` : `hd/env/foliage/act1/texture/${f}`);
const zip = new AdmZip();
zip.addLocalFolder(OUT);
// Stamped with the game data version it was built against; the server only
// ships the overlay while data/dataversionbuild.txt still matches.
const MANIFEST = '_autumn_manifest.json';
zip.addFile(MANIFEST, Buffer.from(JSON.stringify({
  dataVersionBuild: fs.readFileSync('data/dataversionbuild.txt', 'utf8').trim(),
  builtAt: new Date().toISOString().slice(0, 10),
  sources: SOURCES,
}, null, 1)));
zip.writeZip(ZIP);
console.log(`overlay: ${files} files, ${(bytes / 1048576).toFixed(1)} MB -> ${ZIP} ${(fs.statSync(ZIP).size / 1048576).toFixed(1)} MB`);
