#!/usr/bin/env node
// Assembles the Autumn Towns HD overlay (offline) into data/autumn/overlay.zip.
// Every file under it is copied verbatim into generated mods at data/<path>
// during October and November (src/lib/seasons). Nothing is computed per request.
//
//   node scripts/build-autumn-assets.mjs --d2rpp <d2rpp.exe>   -> data/autumn/assets
//   node scripts/build-autumn-foliage.mjs                      -> data/autumn/foliage
//   node scripts/build-season-town-props.mjs --season autumn --bounds <cache> -> data/autumn/town-props.json
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
import { createOverlay, parseArgs, CANDLE_PARTICLES as PARTICLES } from './lib/season-overlay.mjs';

const arg = parseArgs();
const SRC = arg('src', 'D:/D2RModding/data/data');
const { put, putJson, readVanilla, readJson, transform, model, vfx, entity, peekId, candle, addDeps, writeLut, finish } =
  createOverlay({ season: 'autumn', src: SRC });

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

for (const f of fs.readdirSync('data/autumn/foliage').filter(f => f.endsWith('.texture'))) {
  const dir = f.startsWith('act1_leaves') ? 'hd/env/texture/global/decal/act1' : 'hd/env/foliage/act1/texture';
  put(`${dir}/${f}`, fs.readFileSync(`data/autumn/foliage/${f}`));
}

// ── Entities ─────────────────────────────────────────────────────────────────
function prop(kind, at, yaw, scale) {
  const n = `d2rr_${kind}_${peekId()}`;
  const out = [entity(n, [transform(n, at, yaw, scale), model(n, M[kind])])];
  // Candle inside: the flame low in the hollow, its light a little above.
  if (kind === 'jack') out.push(...candle(n, at, scale));
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

// Only muted, darker, yellow-green foliage tones slide toward autumn
// orange/gold; vivid or bright greens (the poison tint on characters, poison
// effects, green UI-ish highlights) are left alone. Everything gets a gentle
// warm grade.
writeLut(LUT.slice(5), (r, g, b) => {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, v = max, s = max ? d / max : 0;
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  const ramp = (x, from, to) => Math.max(0, Math.min(1, (x - from) / (to - from)));
  const hueW = Math.exp(-(((h - 80) / 24) ** 2)) * ramp(h, 105, 95);   // yellow-greens, none past ~105°
  const satW = Math.min(1, s * 2.5) * ramp(s, 0.62, 0.47);              // muted only
  const valW = ramp(v, 0.62, 0.42);                                     // darker only (lit characters are bright)
  const w = hueW * satW * valW * 0.95;
  const h2 = h + (26 - h) * w, s2 = s * (1 - 0.15 * w);
  const c = v * s2, x = c * (1 - Math.abs(((h2 / 60) % 2) - 1)), m = v - c;
  [r, g, b] = h2 < 60 ? [c, x, 0] : h2 < 120 ? [x, c, 0] : h2 < 180 ? [0, c, x] : h2 < 240 ? [0, x, c] : h2 < 300 ? [x, 0, c] : [c, 0, x];
  return [Math.min(1, (r + m) * 1.02), (g + m) * 0.98, (b + m) * 0.94];
});

// ── The Pumpkin King ─────────────────────────────────────────────────────────
// Cow King with its head and crown hidden (build-autumn-cowking.mjs) and a
// big jack-o'-lantern attached to neck_bind_jnt, the way weapons attach to
// hands, so it follows every animation. The neck bone has identity bind
// rotation (at 0, 8.989, -0.098) and the cow faces +Z, as does the jack's
// carved face, so only offset and scale are needed: centred over the torso's
// centreline (z 0.25, not out front where the cow's head was), sitting on the
// shoulders with its base sunk into the neck hump (y 9.25). Playtest: the
// head-position version looked terrifying.
{
  const HEAD_ITEM = 'data/hd/d2rr/autumn/pumpkin_head.json';
  for (let lod = 0; lod <= 3; lod++)
    put(`hd/character/enemy/cowking/torso_lod${lod}.model`, fs.readFileSync(`data/autumn/cowking/torso_lod${lod}.model`));
  putJson(HEAD_ITEM.slice(5), {
    dependencies: { particles: PARTICLES.map(p => ({ path: p })), models: [{ path: M.jack }], skeletons: [], animations: [],
      textures: [{ path: 'data/hd/d2rr/autumn/jack_o_lantern_alb.texture' }], physics: [], json: [], variantdata: [], objecteffects: [], other: [] },
    type: 'UnitDefinition', name: 'd2rr_pumpkin_head',
    entities: [
      entity('root_entity', [{ type: 'UnitRootComponent', name: 'root_entity_UnitRootComponent', state_machine_filename: '',
        doNotInheritRotation: false, rotationOverride: { x: 0, y: 0, z: 0, w: 1 }, doNotUseHDHeight: false,
        hideAllMeshWhenInOpenedMode: false, onCreateEventName: '', animations: [] }]),
      entity('model_entity', [model('model_entity', M.jack)]),
      entity('candle_flame', [transform('candle_flame', [0, 0.2, 0]), vfx('candle_flame', PARTICLES[0])]),
      entity('candle_light', [transform('candle_light', [0, 0.35, 0]), vfx('candle_light', PARTICLES[1])]),
    ],
  });
  const ck = readJson('hd/character/enemy/cowking.json');
  ck.entities.push(entity('entity_d2rr_pumpkin_head', [
    { type: 'UnitPartComponent', name: 'entity_d2rr_pumpkin_head_UnitPart', part: 'torso', variant: 'lit' },
    { type: 'UnitAttachmentComponent', name: 'entity_d2rr_pumpkin_head_UnitAttachment', filename: HEAD_ITEM,
      overrideBoneName: 'neck_bind_jnt', orientTowardBoneName: '',
      attachmentTransform: { type: 'Transform', name: 'entity_d2rr_pumpkin_head_attachmentTransform',
        translation: { x: 0, y: 0.261, z: 0.348 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 3.7, y: 3.7, z: 3.7 } },
      attachmentStateMachineFilename: '', part: 'torso', variant: 'lit' },
  ]));
  ck.dependencies.json.push({ path: HEAD_ITEM });
  ck.dependencies.models.push({ path: M.jack });
  ck.dependencies.textures.push({ path: 'data/hd/d2rr/autumn/jack_o_lantern_alb.texture' });
  ck.dependencies.particles.push(...PARTICLES.map(p => ({ path: p })));
  putJson('hd/character/enemy/cowking.json', ck);
  // The vanilla torso models are hashed as sources too (patch detection).
  for (let lod = 0; lod <= 3; lod++) readVanilla(`hd/character/enemy/cowking/torso_lod${lod}.model`);
}

// ── Town presets ─────────────────────────────────────────────────────────────
const PROPS = JSON.parse(fs.readFileSync('data/autumn/town-props.json', 'utf8'));
for (const [presetRel, props] of Object.entries(PROPS)) {
  const rel = `hd/env/preset/${presetRel}.json`;
  const p = readJson(rel);
  for (const q of props) p.entities.push(...prop(q.kind, [q.x, q.y, q.z], q.yaw, q.scale));
  addDeps(p, 'models', Object.values(M));
  addDeps(p, 'textures', TEX);
  addDeps(p, 'particles', PARTICLES);
  putJson(rel, p);
}

// Foliage recolours derive from vanilla textures too (build-autumn-foliage).
for (const f of fs.readdirSync('data/autumn/foliage').filter(f => f.endsWith('.texture')))
  readVanilla(f.startsWith('act1_leaves') ? `hd/env/texture/global/decal/act1/${f}` : `hd/env/foliage/act1/texture/${f}`);
finish();
