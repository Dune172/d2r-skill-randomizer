// OBJ -> D2R .model by template transplant (offline tooling).
//
// d2rpp's OBJImport builds a bare mesh D2R won't draw (no model/skeleton/bone
// binding, no D2R material maps, no VertexScale). Instead the mesh is written
// into a decompressed vanilla single-mesh prop (scripts/lib/gr2patch.py), its
// three texture slots are renamed, and d2rpp recompresses it. d2rpp.exe ships
// with Bonesy's D2R MoPaH (d2rmodding.com/modtools); python and the template
// (a vanilla model from a CASC extraction) are only needed here.
//
// The template's VertexScale bounds the mesh: sackpile01 allows coordinates
// up to ±3.52 units, 7164 vertices and 11532 triangles.
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

export const DEFAULT_TEMPLATE = 'D:/D2RModding/data/data/hd/env/model/global/prop/act1/caves/act1_caves_encampment/sackpile01_lod0.model';
const NRM = 'data/hd/env/texture/placeholder_nrm.texture';
const ORM = 'data/hd/env/texture/placeholder_orm.texture';

export function convert({ d2rpp, template = DEFAULT_TEMPLATE, objFile, albedoPath, modelFile, work }) {
  const run = (...a) => {
    try { return execFileSync(a[0], a.slice(1), { cwd: work, stdio: 'pipe' }).toString(); }
    catch (e) { throw new Error(`${path.basename(a[0])} ${a[1]} failed: ${e.stdout}${e.stderr}`); }
  };
  const lib = path.dirname(fileURLToPath(import.meta.url));
  run(d2rpp, 'Decompress', template, '-output', 'template.gr2');
  run('python', path.join(lib, 'gr2patch.py'), 'template.gr2', objFile, 'patched.gr2');
  // Texture slots by suffix; the vanilla order varies between models.
  const names = run('python', path.join(lib, 'gr2dump.py'), 'template.gr2', '3')
    .split(/\r?\n/).filter(l => /^ {6}FromFileName: '/.test(l)).map(l => l.split("'")[1]);
  let cur = 'patched.gr2';
  names.forEach((name, i) => {
    const target = /_alb\.texture$/i.test(name) ? albedoPath : /_nrm\.texture$/i.test(name) ? NRM : ORM;
    const next = `renamed${i}.gr2`;
    run(d2rpp, 'RenameElement', cur, '-rename', `textures[${i}]`, '-newname', target, '-output', next);
    cur = next;
  });
  run(d2rpp, 'Compress', cur, '-output', modelFile);
}
