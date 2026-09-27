// Shared plumbing for the seasonal HD overlay builders
// (scripts/build-autumn-overlay.mjs, scripts/build-winter-overlay.mjs).
//
//   const o = createOverlay({ season: 'winter', src });
//   o.putJson(rel, obj); o.readJson(rel); o.entity(...); o.writeLut(...); o.finish();
//
// Every path taken by put/readVanilla is relative to the mod's data/ folder
// (no leading "data/"). Vanilla files read through readVanilla are hashed into
// the manifest: after a D2R patch verify-season --src flags any that changed,
// so the overlay gets rebuilt instead of shipping stale copies over patched
// game files.
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createRequire } from 'module';

const AdmZip = createRequire(import.meta.url)('adm-zip');

export const CANDLE_PARTICLES = ['data/hd/vfx/particles/env/common/generic/vfx_candle_Flame.particles',
  'data/hd/vfx/particles/env/common/generic/vfx_candle_light.particles'];

export function createOverlay({ season, src }) {
  const OUT = `data/${season}/overlay`;   // working tree (gitignored)
  const ZIP = `data/${season}/overlay.zip`; // committed; loaded by src/lib/seasons/overlay.ts
  fs.rmSync(OUT, { recursive: true, force: true });

  const SOURCES = {};
  const put = (rel, data) => { const p = path.join(OUT, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, data); };
  const readVanilla = rel => {
    const buf = fs.readFileSync(`${src}/${rel}`);
    SOURCES[rel] = crypto.createHash('sha1').update(buf).digest('hex');
    return buf;
  };
  const readJson = rel => JSON.parse(readVanilla(rel).toString('utf8'));
  const putJson = (rel, obj) => put(rel, JSON.stringify(obj));

  // ── Entities ───────────────────────────────────────────────────────────────
  let nextId = 3900000000;
  const quatYaw = deg => { const r = (deg * Math.PI) / 360; return { x: 0, y: Math.sin(r), z: 0, w: Math.cos(r) }; };
  const transform = (name, [x, y, z], yaw = 0, s = 1) => ({ type: 'TransformDefinitionComponent', name: `${name}_TransformDefinitionComponent`,
    position: { x, y, z }, orientation: quatYaw(yaw), scale: { x: s, y: s, z: s }, inheritOnlyPosition: false });
  const model = (name, filename) => ({ type: 'ModelDefinitionComponent', name: `${name}_ModelDefinitionComponent`, filename,
    visibleLayers: 1, lightMask: 19, shadowMask: 3, ghostShadows: false, floorModel: false, terrainBlendEnableYUpBlend: false, terrainBlendMode: 1 });
  const vfx = (name, filename) => ({ type: 'VfxDefinitionComponent', name: `${name}_VfxDefinition`, filename, hardKillOnDestroy: false });
  const entity = (name, components) => ({ type: 'Entity', name, id: nextId++, components });
  const peekId = () => nextId;

  // A lit candle (flame low, its light a little above) at a prop's origin.
  const candle = (n, [x, y, z], scale, flameY = 0.2, lightY = 0.35) => [
    entity(`${n}_flame`, [transform(`${n}_flame`, [x, y + flameY * scale, z]), vfx(`${n}_flame`, CANDLE_PARTICLES[0])]),
    entity(`${n}_light`, [transform(`${n}_light`, [x, y + lightY * scale, z]), vfx(`${n}_light`, CANDLE_PARTICLES[1])]),
  ];

  // Append entities to a preset and make sure each dependency is listed once.
  const addDeps = (doc, kind, paths) => {
    doc.dependencies[kind] = doc.dependencies[kind] ?? [];
    for (const x of paths) if (!doc.dependencies[kind].some(d => d.path === x)) doc.dependencies[kind].push({ path: x });
  };

  // ── Colour-grading LUT ─────────────────────────────────────────────────────
  // 65^3 RGBA16F 3D LUT with the vanilla header, r fastest; grade(r, g, b) maps
  // each identity colour (0..1) to its graded [r, g, b].
  const writeLut = (rel, grade) => {
    const hdr = readVanilla('hd/env/lut/default.dds').subarray(0, 128);
    const N = 65, buf = Buffer.alloc(128 + N * N * N * 8);
    hdr.copy(buf, 0);
    const f2h = v => { const f = new Float32Array([v]), i = new Uint32Array(f.buffer)[0]; const s = (i >> 16) & 0x8000, e = ((i >> 23) & 0xff) - 112, m = i & 0x7fffff; if (e <= 0) return s; if (e >= 31) return s | 0x7c00; return s | (e << 10) | (m >> 13); };
    let o = 128;
    for (let bi = 0; bi < N; bi++) for (let gi = 0; gi < N; gi++) for (let ri = 0; ri < N; ri++) {
      for (const val of [...grade(ri / 64, gi / 64, bi / 64), 1]) { buf.writeUInt16LE(f2h(val), o); o += 2; }
    }
    put(rel, buf);
  };

  // ── Manifest + zip ─────────────────────────────────────────────────────────
  const finish = () => {
    let files = 0, bytes = 0;
    const walk = d => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else { files++; bytes += fs.statSync(p).size; } } };
    walk(OUT);
    const zip = new AdmZip();
    zip.addLocalFolder(OUT);
    // Stamped with the game data version it was built against; the server only
    // ships the overlay while data/dataversionbuild.txt still matches.
    zip.addFile(`_${season}_manifest.json`, Buffer.from(JSON.stringify({
      dataVersionBuild: fs.readFileSync('data/dataversionbuild.txt', 'utf8').trim(),
      builtAt: new Date().toISOString().slice(0, 10),
      sources: SOURCES,
    }, null, 1)));
    zip.writeZip(ZIP);
    console.log(`overlay: ${files} files, ${(bytes / 1048576).toFixed(1)} MB -> ${ZIP} ${(fs.statSync(ZIP).size / 1048576).toFixed(1)} MB`);
  };

  return { put, putJson, readVanilla, readJson, quatYaw, transform, model, vfx, entity, peekId, candle, addDeps, writeLut, finish };
}

export function parseArgs(argv = process.argv.slice(2)) {
  return (name, fallback) => { const i = argv.indexOf(`--${name}`); return i === -1 ? fallback : argv[i + 1]; };
}
