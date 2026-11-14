#!/usr/bin/env node
// Krampus (offline): the HD unit for the Krampus Is Coming mutation. Writes data/krampus/.
//
//   node scripts/build-krampus-assets.mjs [--src D:/D2RModding/data/data]
//
// --src is a CASC extraction holding data/hd/character/enemy/goatman1.json
// (scripts/extract-casc.ps1 -Files "data:data\hd\character\enemy\goatman1.json").
// No d2rpp or Python: nothing here touches a model file.
//
// - d2rr_krampus.json: goatman1.json (the Moon Clan goat-demon) under a new token,
//   enlarged with a root TransformDefinitionComponent (vanilla act2hire.json scales
//   its root the same way, to 0.95), carrying the Winter Towns gift stack on its back.
//   The gifts are a UnitAttachmentComponent on a skeleton bone, the mechanism weapons
//   use and the Pumpkin King's head proved in game, so they follow every animation.
// - krampus_gifts.json: the attachment's UnitDefinition, a single model entity.
//   The model is data/winter/assets/gifts_lod0.model, shipped by src/lib/krampus-assets.ts
//   in the unused vanilla test slot hd/bvt/models/skin_sphere (the seasons use
//   blend_sphere, glass_sphere and detail_normal_sphere). The model's material
//   points at data/hd/d2rr/winter/gifts_alb.texture, so that ships too.
// - manifest.json: the DataVersionBuild and the SHA-1 of goatman1.json it was built
//   from. The server ships these files only while data/dataversionbuild.txt matches
//   (Krampus then falls back to the plain goatman model).
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const args = process.argv.slice(2);
const arg = (name, fallback) => { const i = args.indexOf(`--${name}`); return i === -1 ? fallback : args[i + 1]; };
const SRC = arg('src', 'D:/D2RModding/data/data');
const OUT = 'data/krampus';

export const KRAMPUS_TOKEN = 'd2rr_krampus';
export const GIFTS_JSON = 'data/hd/d2rr/krampus/krampus_gifts.json';
export const GIFTS_MODEL = 'data/hd/bvt/models/skin_sphere.model';
export const GIFTS_TEXTURE = 'data/hd/d2rr/winter/gifts_alb.texture';

/** Whole-body scale. Collision (monstats2 SizeX/SizeY) is unchanged. */
export const KRAMPUS_SCALE = 1.45;
/**
 * Gift stack on the back. Seen in game (town NPCs wearing this unit): neck_bind_jnt
 * exists on the goatman rig and, like the Cow King's, has identity rotation with the
 * body facing +z and y up, so the stack stands upright; −y and −z put it below and
 * behind the neck. Attachments render far smaller than the same model placed in a
 * level: scale 1 is a thumbnail, 10 is wider than the goat-demon. At (0, −0.5, −0.5)
 * scale 5 the stack sat on his shoulders and hid his head; (0, −1, −1) scale 4 puts
 * it on his back with the horns showing above and the boxes peeking out either side.
 * See docs/krampus.md.
 */
export const GIFTS_ATTACH = {
  bone: 'neck_bind_jnt',
  translation: { x: 0, y: -1, z: -1 },
  rotation: { x: 0, y: 0, z: 0 },
  scale: 4,
};

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
const sha1 = (buf) => crypto.createHash('sha1').update(buf).digest('hex');

export function giftsUnit() {
  return {
    dependencies: {
      particles: [], models: [{ path: GIFTS_MODEL }], skeletons: [], animations: [],
      textures: [{ path: GIFTS_TEXTURE }], physics: [], json: [], variantdata: [], objecteffects: [], other: [],
    },
    type: 'UnitDefinition', name: 'd2rr_krampus_gifts',
    entities: [
      { type: 'Entity', name: 'root_entity', id: 3910000000, components: [
        { type: 'UnitRootComponent', name: 'root_entity_UnitRootComponent', state_machine_filename: '',
          doNotInheritRotation: false, rotationOverride: { x: 0, y: 0, z: 0, w: 1 }, doNotUseHDHeight: false,
          hideAllMeshWhenInOpenedMode: false, onCreateEventName: '', animations: [] }] },
      { type: 'Entity', name: 'model_entity', id: 3910000001, components: [
        { type: 'ModelDefinitionComponent', name: 'model_entity_ModelDefinitionComponent', filename: GIFTS_MODEL,
          visibleLayers: 1, lightMask: 19, shadowMask: 3, ghostShadows: false, floorModel: false,
          terrainBlendEnableYUpBlend: false, terrainBlendMode: 1 }] },
    ],
  };
}

/** goatman1.json → the Krampus unit. `attach` and `scale` are parameters so test builds can try variants. */
export function krampusUnit(goatman, { attach = GIFTS_ATTACH, scale = KRAMPUS_SCALE, name = KRAMPUS_TOKEN, giftsJson = GIFTS_JSON } = {}) {
  const unit = structuredClone(goatman);
  unit.name = name;
  const deps = unit.dependencies;
  const addDep = (kind, p) => { if (!deps[kind].some(d => d.path === p)) deps[kind].push({ path: p }); };
  addDep('json', giftsJson);
  addDep('models', GIFTS_MODEL);
  addDep('textures', GIFTS_TEXTURE);

  const root = unit.entities.find(e => e.components.some(c => c.type === 'UnitRootComponent'));
  if (!root) throw new Error('goatman1.json has no root entity');
  if (root.components.some(c => c.type === 'TransformDefinitionComponent')) throw new Error('goatman1.json root already has a transform');
  root.components.push({
    type: 'TransformDefinitionComponent', name: 'entity_root_TransformDefinition',
    position: { x: 0, y: 0, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 },
    scale: { x: scale, y: scale, z: scale }, inheritOnlyPosition: false,
  });

  const torso = unit.entities.find(e => e.name === 'entity_torso');
  const variant = torso?.components.find(c => c.type === 'UnitPartComponent')?.variant ?? 'lit';
  const s = attach.scale;
  unit.entities.push({ type: 'Entity', name: 'entity_d2rr_krampus_gifts', id: 3910000010, components: [
    { type: 'UnitPartComponent', name: 'entity_d2rr_krampus_gifts_UnitPart', part: 'torso', variant },
    { type: 'UnitAttachmentComponent', name: 'entity_d2rr_krampus_gifts_UnitAttachment', filename: giftsJson,
      overrideBoneName: attach.bone, orientTowardBoneName: '',
      attachmentTransform: { type: 'Transform', name: 'entity_d2rr_krampus_gifts_attachmentTransform',
        translation: attach.translation, rotation: attach.rotation, scale: { x: s, y: s, z: s } },
      attachmentStateMachineFilename: '', part: 'torso', variant },
  ] });
  return unit;
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/').replace(/^\//, '')}`) {
  const srcPath = `${SRC}/hd/character/enemy/goatman1.json`;
  const raw = fs.readFileSync(srcPath);
  const goatman = readJson(srcPath);
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, `${KRAMPUS_TOKEN}.json`), JSON.stringify(krampusUnit(goatman)));
  fs.writeFileSync(path.join(OUT, 'krampus_gifts.json'), JSON.stringify(giftsUnit()));
  const dataVersionBuild = fs.readFileSync('data/dataversionbuild.txt', 'utf8').trim();
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({
    dataVersionBuild,
    sources: { 'data/hd/character/enemy/goatman1.json': sha1(raw) },
    attach: GIFTS_ATTACH, scale: KRAMPUS_SCALE,
  }, null, 2) + '\n');
  console.log(`Wrote ${OUT}/${KRAMPUS_TOKEN}.json, krampus_gifts.json, manifest.json (build ${dataVersionBuild})`);
}
