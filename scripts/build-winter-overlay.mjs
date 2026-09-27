#!/usr/bin/env node
// Assembles the Winter Towns HD overlay (offline) into data/winter/overlay.zip.
// Every file under it is copied verbatim into generated mods at data/<path>
// during December and January (src/lib/seasons). Nothing is computed per request.
//
//   node scripts/build-winter-assets.mjs --d2rpp <d2rpp.exe>                  -> data/winter/assets
//   node scripts/build-winter-foliage.mjs                                     -> data/winter/foliage
//   node scripts/build-season-town-props.mjs --season winter --bounds <cache> -> data/winter/town-props.json
//   node scripts/build-winter-overlay.mjs [--src D:/D2RModding/data/data]
//
// Vanilla HD files (town presets, Act 1 outdoor biomes and lighting) are read
// from a CASC extraction (--src) and modified:
//   - town presets: snowmen standing in a mound of snow, gift piles and candle
//     lanterns, from town-props.json. Visual-only entities, no collision.
//   - Act 1 outdoor biomes (the Rogue Encampment included): grass and moss
//     ground becomes Act V snow, with dry Act V grass poking through, fewer
//     weeds and snow clumps; puddles freeze. All textures and models used are
//     vanilla Act V ones, so the ground costs no download.
//   - their time-of-day lighting: a gentle cool grade (no hue shifts: see
//     docs/autumn-towns.md), a cooler key light and paler fog.
//   - frosted maple / hawthorn / witch hazel leaves and fallen-leaf decals.
import fs from 'fs';
import { createOverlay, parseArgs, CANDLE_PARTICLES as PARTICLES } from './lib/season-overlay.mjs';
import { LANTERN_FLAME_Y } from './build-winter-assets.mjs';

const arg = parseArgs();
const SRC = arg('src', 'D:/D2RModding/data/data');
const { put, putJson, readVanilla, readJson, transform, model, entity, peekId, candle, addDeps, writeLut, finish } =
  createOverlay({ season: 'winter', src: SRC });

// ── Models + textures ────────────────────────────────────────────────────────
// Unused vanilla test-model slots (hd/bvt/models, one LOD each). Autumn uses
// blend_sphere and glass_sphere too; the seasons never ship together.
const M = {
  snowman: 'data/hd/bvt/models/blend_sphere.model',
  gifts: 'data/hd/bvt/models/glass_sphere.model',
  lantern: 'data/hd/bvt/models/detail_normal_sphere.model',
  mound: 'data/hd/env/model/global/decorator/expansion/siege/expansion_siege_rocks/snow_clump03.model',
};
put('hd/bvt/models/blend_sphere_lod0.model', fs.readFileSync('data/winter/assets/snowman_lod0.model'));
put('hd/bvt/models/glass_sphere_lod0.model', fs.readFileSync('data/winter/assets/gifts_lod0.model'));
put('hd/bvt/models/detail_normal_sphere_lod0.model', fs.readFileSync('data/winter/assets/lantern_lod0.model'));
for (const kind of ['snowman', 'gifts', 'lantern'])
  put(`hd/d2rr/winter/${kind}_alb.texture`, fs.readFileSync(`data/winter/assets/${kind}_alb.texture`));
const SNOW = n => ['alb', 'nrm', 'orm'].map(s => `data/hd/env/texture/terrain/expansion/siege/expansion_siege_${n}_${s}.texture`);
const TEX = [...['snowman', 'gifts', 'lantern'].map(k => `data/hd/d2rr/winter/${k}_alb.texture`), ...SNOW('snow01')];

for (const f of fs.readdirSync('data/winter/foliage').filter(f => f.endsWith('.texture'))) {
  const dir = f.startsWith('act1_leaves') ? 'hd/env/texture/global/decal/act1' : 'hd/env/foliage/act1/texture';
  put(`${dir}/${f}`, fs.readFileSync(`data/winter/foliage/${f}`));
}

// ── Entities ─────────────────────────────────────────────────────────────────
function prop(kind, at, yaw, scale) {
  const n = `d2rr_${kind}_${peekId()}`;
  const out = [entity(n, [transform(n, at, yaw, scale), model(n, M[kind])])];
  const [x, y, z] = at;
  // Snowmen stand in a low mound of snow (a half-sunk Act V snow clump).
  if (kind === 'snowman') out.push(entity(`${n}_mound`, [transform(`${n}_mound`, [x, y - 0.14 * scale, z], (yaw * 7) % 360, 0.3 * scale), model(`${n}_mound`, M.mound)]));
  // Candle in the lantern: the flame on the wick, its light a little above.
  if (kind === 'lantern') out.push(...candle(n, at, scale, LANTERN_FLAME_Y + 0.01, LANTERN_FLAME_Y + 0.15));
  return out;
}

// ── Act 1 outdoors: biome, lighting, LUT ─────────────────────────────────────
const LUT = 'data/hd/env/lut/d2rr_winter.dds';
// Act V's own snow ground, one per Act 1 grass/moss texture so the ground
// keeps its variety; dry Act V grass (the snowy ruins grass) pokes through.
const SNOW_FOR = { grass01: 'snow03', grass02: 'snow01', grass03: 'snow02', moss01: 'snow02', moss02: 'snow01', moss03: 'snow03',
  grass_dead01: 'snow01', grass_patchy01: 'snow03' }; // the last two: the Rogue Encampment
const SNOW_NRM = { snow01: 1.2, snow02: 1.2, snow03: 1.0 };
const SNOW_TEX_PATHS = {
  // Casing as the vanilla Act V biomes reference them.
  snow01: SNOW('snow01'), snow02: SNOW('snow02'),
  snow03: ['ALB', 'NRM', 'ORM'].map(s => `data/hd/env/texture/terrain/expansion/siege/expansion_siege_snow03_${s}.texture`),
};
const ICE = ['ALB', 'NRM', 'ORM'].map(s => `data/hd/env/texture/terrain/expansion/siege/expansion_siege_ice01_${s}.texture`);
const WINTER_GRASS = 'data/hd/env/texture/terrain/grass/expansion_siege_grass_atlas01_ALB.texture';
const CLUMPS = [
  { m: 'data/hd/env/model/global/decorator/expansion/siege/expansion_siege_rocks/snow_clump03.model', density: 0.1, scale: { x: 0.4, y: 0.67 }, sink: { x: -0.1, y: 0.1 } },
  { m: 'data/hd/env/model/global/decorator/expansion/siege/expansion_siege_rocks/snow_clump01.model', density: 0.05, scale: { x: 0.25, y: 0.45 }, sink: { x: -0.15, y: 0.0 } },
];
const cool = (c, k) => { c.x *= 1 - 0.1 * k; c.z = Math.min(1, c.z * (1 + 0.12 * k)); };
const pale = (c, k) => { c.x += (0.86 - c.x) * k; c.y += (0.9 - c.y) * k; c.z += (1 - c.z) * k; };

for (const biome of ['act1_outdoors', 'act1_tristram', 'act1_campfire']) {
  const b = readJson(`hd/env/biome/${biome}.json`);
  for (const v of b.visualDataFilenames) {
    const rel = v.visualDataFilename.slice(5);
    const vis = readJson(rel);
    const vd = vis.entities[0].components[0];
    const tod = rel.match(/_(\w+)\.json$/)[1];
    vd.gradingLutFile = LUT;
    if (vd.fogDiffuse) pale(vd.fogDiffuse, 0.5);
    for (const e of vis.entities) for (const c of e.components)
      if (c.type === 'DirectionalLightDefinitionComponent' && e.name === 'global_key_light') cool(c.color, tod === 'night' ? 0.3 : 1);
    vis.dependencies.other = [...(vis.dependencies.other ?? []).filter(o => !o.path.includes('/lut/')), { path: LUT }];
    putJson(rel, vis);
  }
  const used = new Set();
  for (const key of Object.keys(b)) if (key.startsWith('terrainData')) for (const layer of b[key].terrainLayers ?? []) {
    const src = (layer.Albedo ?? '').match(/act1_outdoors_(grass0\d|moss0\d|grass_dead0\d|grass_patchy0\d)(?:_low)?_ALB/i)?.[1];
    const snow = src && SNOW_FOR[src];
    if (snow) {
      [layer.Albedo, layer.Normal, layer.ORM] = SNOW_TEX_PATHS[snow];
      SNOW_TEX_PATHS[snow].forEach(p => used.add(p));
      Object.assign(layer, { FootstepMaterial: 'snow', FootstepMaterialVFX: 'LooseSnow', NormalIntensity: SNOW_NRM[snow] });
      // Dry winter grass through the snow: sparser and frost-pale.
      layer.GrassTexture = WINTER_GRASS;
      layer.GrassAtlas = { x: 6, y: 1 };
      layer.GrassDensity = +(layer.GrassDensity * 0.4).toFixed(3);
      layer.GrassShootsDensity = +(layer.GrassShootsDensity * 0.5).toFixed(3);
      layer.GrassColor = { x: 0.92, y: 0.93, z: 0.94 };
      used.add(WINTER_GRASS);
      for (const c of layer.Clutter ?? []) c.Density = +(c.Density * 0.35).toFixed(3);
      layer.Clutter = layer.Clutter ?? [];
      CLUMPS.forEach((c, k) => layer.Clutter.push({ type: 'Clutter', name: `${layer.name}_d2rr_snow_${k}`, ModelFilename: c.m,
        Density: c.density, Scale: c.scale, Sink: c.sink, RotationMax: 180.0, IsFloorModel: true }));
    } else if (/act1_outdoors_puddle/i.test(layer.Albedo ?? '')) {
      // Frozen puddles.
      [layer.Albedo, layer.Normal, layer.ORM] = ICE;
      ICE.forEach(p => used.add(p));
      Object.assign(layer, { FootstepMaterial: 'snow', FootstepMaterialVFX: 'LooseSnow' });
    }
  }
  addDeps(b, 'models', CLUMPS.map(c => c.m));
  addDeps(b, 'textures', [...used, ...SNOW('snow01')]);
  putJson(`hd/env/biome/${biome}.json`, b);
}

// A gentle, global cool grade: a touch of desaturation, blue lifted a little,
// red eased. Never hue-selective (a hue-selective LUT turned the poison tint
// yellow in the autumn playtest); the winter colour comes from textures.
writeLut(LUT.slice(5), (r, g, b) => {
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b, k = 0.12;
  r += (y - r) * k; g += (y - g) * k; b += (y - b) * k;
  return [r * 0.97, g * 0.995, Math.min(1, b * 1.04 + 0.006)];
});

// ── Town presets ─────────────────────────────────────────────────────────────
const PROPS = JSON.parse(fs.readFileSync('data/winter/town-props.json', 'utf8'));
for (const [presetRel, props] of Object.entries(PROPS)) {
  const rel = `hd/env/preset/${presetRel}.json`;
  const p = readJson(rel);
  for (const q of props) p.entities.push(...prop(q.kind, [q.x, q.y, q.z], q.yaw, q.scale));
  addDeps(p, 'models', Object.values(M));
  addDeps(p, 'textures', TEX);
  addDeps(p, 'particles', PARTICLES);
  putJson(rel, p);
}

// Foliage frosting derives from vanilla textures too (build-winter-foliage).
for (const f of fs.readdirSync('data/winter/foliage').filter(f => f.endsWith('.texture')))
  readVanilla(f.startsWith('act1_leaves') ? `hd/env/texture/global/decal/act1/${f}` : `hd/env/foliage/act1/texture/${f}`);
// So are the vanilla Act V files the overlay now points at: a patch that
// moves or changes them should flag a rebuild too.
for (const p of [...new Set([...Object.values(SNOW_TEX_PATHS).flat(), ...ICE, WINTER_GRASS, ...CLUMPS.map(c => c.m.replace('.model', '_lod0.model'))])])
  readVanilla(p.slice(5).toLowerCase());
finish();
