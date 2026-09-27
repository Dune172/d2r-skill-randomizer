#!/usr/bin/env node
// The Pumpkin King (offline): the Cow King's head replaced by a big
// jack-o'-lantern for the Autumn Towns season. Writes data/autumn/cowking/.
//
//   node scripts/build-autumn-cowking.mjs --d2rpp <d2rpp.exe> [--src D:/D2RModding/data/data]
//
// - torso_lod0..3.model: vanilla models with the head hidden in place
//   (scripts/lib/gr2patch.py hide_bones): body triangles skinned mainly to
//   head/jaw/lip/eye/brow/ear/nose-ring bones are dropped, and the eye, nose
//   ring, head/ear fur and mouth-interior meshes emptied. The armor mesh (with
//   the crown's triangles hidden), skinning and skeleton are untouched.
// - build-autumn-overlay.mjs then attaches the jack-o'-lantern model to
//   neck_bind_jnt in cowking.json (UnitAttachmentComponent, as weapons attach
//   to hands), so it follows every animation.
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const args = process.argv.slice(2);
const arg = (name, fallback) => { const i = args.indexOf(`--${name}`); return i === -1 ? fallback : args[i + 1]; };
const SRC = arg('src', 'D:/D2RModding/data/data');
const D2RPP = arg('d2rpp');
const OUT = 'data/autumn/cowking';
const LIB = path.join(path.dirname(fileURLToPath(import.meta.url)), 'lib');

// Bones whose skin is the cow's head (regexes over bone names). The crown is
// hidden too: it is baked into the armor mesh at the old head position, and
// the model's position quantisation tops out at the crown's peak, so it can't
// be lifted onto the centred pumpkin.
export const HEAD_BONES = ['^(head|jaw)_bind_jnt$', 'lip', 'eye', 'brow', 'ear_bind', 'nose', 'crown'];
export const HEAD_MESHES = ['eyesShape', 'noseringShape', 'head_fur', 'ear_fur', 'inner_'];

fs.mkdirSync(OUT, { recursive: true });
const work = fs.mkdtempSync(path.join(OUT, '.work-'));
try {
  for (let lod = 0; lod <= 3; lod++) {
    const src = `${SRC}/hd/character/enemy/cowking/torso_lod${lod}.model`;
    const raw = path.join(work, `raw${lod}.gr2`), hidden = path.join(work, `hidden${lod}.gr2`);
    execFileSync(D2RPP, ['Decompress', src, '-output', raw], { stdio: 'pipe' });
    const report = execFileSync('python', ['-c', `
import sys, json; sys.path.insert(0, ${JSON.stringify(LIB)})
from gr2patch import hide_bones
print(json.dumps(hide_bones(${JSON.stringify(raw)}, ${JSON.stringify(hidden)}, ${JSON.stringify(HEAD_BONES)}, ${JSON.stringify(HEAD_MESHES)})))`]).toString();
    execFileSync(D2RPP, ['Compress', hidden, '-output', path.join(OUT, `torso_lod${lod}.model`)], { stdio: 'pipe' });
    const r = JSON.parse(report);
    const cut = Object.values(r).reduce((n, [a, b]) => n + a - b, 0);
    console.log(`lod${lod}: hid ${cut} head triangles across ${Object.keys(r).length} meshes`);
  }
} finally {
  fs.rmSync(work, { recursive: true, force: true });
}
