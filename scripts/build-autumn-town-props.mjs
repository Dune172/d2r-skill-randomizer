#!/usr/bin/env node
// Places the Autumn Towns decorations (offline) and writes data/autumn/town-props.json.
//
//   python scripts/extract-town-anchors.py                 (NPC/stash spots)
//   python scripts/lib/model_bounds.py <d2rpp> <cache> <presets...>
//   node scripts/build-autumn-town-props.mjs --bounds <cache> [--src D:/D2RModding/data/data]
//
// Each group of props is anchored on an NPC spawn spot, a town object (the
// stash) or a camp prefab, and auto-placed beside nearby ground clutter
// (vases, sacks, crates, potato piles...), which the level designers put where
// nobody walks. A spot is rejected if the prop's footprint overlaps any
// ground-level model's bounding box (fire rings, carts, stalls, walls), comes
// too close to an NPC spawn, or crowds another decoration. Deterministic.
import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const arg = (name, fallback) => { const i = args.indexOf(`--${name}`); return i === -1 ? fallback : args[i + 1]; };
const SRC = arg('src', 'D:/D2RModding/data/data');
const BOUNDS = JSON.parse(fs.readFileSync(arg('bounds'), 'utf8'));
const ANCHORS = JSON.parse(fs.readFileSync('data/autumn/town-anchors.json', 'utf8'));
const OUT = 'data/autumn/town-props.json';
const readJson = rel => JSON.parse(fs.readFileSync(`${SRC}/${rel}`, 'utf8'));

// Groups per town: [anchor, [kind, scale]...]; anchor = 'npc:<name>',
// 'obj:<name>' or 'prefab:<file>'. Pumpkin/jack model ~0.83 wide x 0.54 tall at scale 1.
const S = 1.2, M = 1.5, L = 1.9; // small / medium / large
const GROUPS = {
  1: [
    ['prefab:pf_town_campfire01', [['jack', 2.0], ['jack', 1.8], ['pumpkin', 2.4], ['corn', 1], ['cornMed', 1]]],
    ['npc:akara', [['pumpkin', S], ['pumpkin', 1.4], ['pumpkin', 1.0], ['jack', 1.3]]],
    ['npc:gheed', [['pumpkin', 1.3], ['pumpkin', 1.0], ['pumpkin', M], ['jack', 1.3]]],
    ['npc:charsi', [['pumpkin', 1.6], ['pumpkin', S], ['corn', 1]]],
    ['prefab:pf_town_wagon04', [['pumpkin', 1.8], ['cornMed', 1]]],
    ['prefab:pf_town_tent01', [['pumpkin', 1.4], ['jack', M]]],
    ['obj:stash', [['jack', M]]],
  ],
  2: [ // Lut Gholein
    ['npc:fara', [['pumpkin', M], ['jack', 1.4]]],
    ['npc:drognan', [['jack', 1.4], ['pumpkin', S]]],
    ['npc:lysander', [['pumpkin', S], ['pumpkin', 1.0], ['jack', 1.3]]],
    ['npc:elzix', [['pumpkin', L], ['pumpkin', S]]],
    ['npc:atma', [['jack', 1.4], ['pumpkin', S]]],
    ['npc:greiz', [['pumpkin', M]]],
    ['obj:stash', [['jack', M]]],
  ],
  3: [ // Kurast Docks
    ['npc:ormus', [['jack', 1.4], ['pumpkin', S]]],
    ['npc:alkor', [['jack', 1.4], ['pumpkin', S]]],
    ['npc:asheara', [['pumpkin', M], ['pumpkin', 1.0]]],
    ['npc:natalya', [['pumpkin', S], ['jack', 1.3]]],
    ['npc:meshif2', [['pumpkin', L], ['pumpkin', S], ['jack', 1.4]]],
    ['obj:stash', [['jack', M]]],
  ],
  4: [ // Pandemonium Fortress: jack-o'-lanterns suit the gloom
    ['npc:jamella', [['jack', M], ['jack', 1.2]]],
    ['npc:halbu', [['jack', M], ['pumpkin', S]]],
    ['npc:tyrael2', [['jack', 1.4]]],
    ['obj:stash', [['jack', M]]],
  ],
  5: [ // Harrogath
    ['npc:malah', [['pumpkin', S], ['jack', 1.3]]],
    ['npc:qual-kehk', [['pumpkin', M], ['jack', 1.4]]],
    ['npc:cain6', [['pumpkin', S], ['pumpkin', 1.0]]],
    ['npc:nihlathak', [['jack', 1.4]]],
    ['obj:stash', [['jack', M]]],
  ],
};

const CLUTTER = /vase|sack|potato|basket|crate|bucket|jug|hay|barrel|pot\d|plank_set|chamber_pot|wood_board|log_pile|pail|jar|urn|box|cask|keg|bag|bottle|pitcher|bowl/i;
const GROUND = /^terrain$|grass|weed|grunge|poop|pebble|decal|clearing|shrub|mud|dirt|stamp|puddle|rug|mat\d|carpet|leaves/i;
// Extra clearance from anything that burns.
const HOT = /fire|brazier|torch|forge|lava|candle|lantern/i;
const radius = (kind, s) => (kind.startsWith('corn') ? 0.6 : 0.45 * s);

function quatYaw(q) { return Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.x * q.x)); }

// Solid ground occupancy on a world grid. Small models block their rotated
// bounding box; large (concave) models block the cells where their triangles
// actually sit at body height (precomputed by model_bounds.py), so the open
// middle of a forge, stall or whole-town dock mesh stays usable.
const GRID = 0.5;
const key = (i, j) => `${i},${j}`;

function scene(preset) {
  const blocked = new Set(), clutter = [];
  const mark = (x, z, pad) => {
    for (let i = Math.floor((x - pad) / GRID); i <= Math.floor((x + pad) / GRID); i++)
      for (let j = Math.floor((z - pad) / GRID); j <= Math.floor((z + pad) / GRID); j++) blocked.add(key(i, j));
  };
  const add = (name, filename, pos, rot, scl, parent) => {
    const b = BOUNDS[filename];
    if (!b) return;
    const box = Array.isArray(b) ? b : b.box;
    const [x0, y0, z0, x1, y1, z1] = box;
    const sx = scl?.x ?? 1, sy = scl?.y ?? 1, sz = scl?.z ?? 1;
    const pyaw = parent?.yaw ?? 0;
    const ox = parent ? parent.x + Math.cos(pyaw) * pos.x + Math.sin(pyaw) * pos.z : pos.x;
    const oz = parent ? parent.z - Math.sin(pyaw) * pos.x + Math.cos(pyaw) * pos.z : pos.z;
    const baseY = (parent?.y ?? 0) + pos.y;
    if (baseY + y0 * sy > 1.5 || (y1 - y0) * sy < 0.25) return; // overhead or flat
    const yaw = pyaw + (rot ? quatYaw(rot) : 0);
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const world = (lx, lz) => [ox + c * lx * sx + s * lz * sz, oz - s * lx * sx + c * lz * sz];
    const hot = HOT.test(name) || HOT.test(filename);
    if (!Array.isArray(b) && b.cells) {
      for (const [ci, cj] of b.cells) {
        const [wx, wz] = world((ci + 0.5) * b.cell, (cj + 0.5) * b.cell);
        mark(wx, wz, (b.cell / 2) * Math.max(sx, sz) + (hot ? 1.2 : 0));
      }
      return;
    }
    const pts = [[x0, z0], [x0, z1], [x1, z0], [x1, z1]].map(([lx, lz]) => world(lx, lz));
    const xs = pts.map(p => p[0]), zs = pts.map(p => p[1]);
    const bx = [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)];
    const pad = hot ? 1.2 : 0;
    for (let x = bx[0] - pad; x <= bx[2] + pad + 1e-9; x += GRID / 2)
      for (let z = bx[1] - pad; z <= bx[3] + pad + 1e-9; z += GRID / 2) mark(x, z, 0);
    // Every small ground model is a potential seed; clutter is preferred.
    if (bx[2] - bx[0] < 6 && bx[3] - bx[1] < 6) clutter.push({ name, box: bx, y: baseY, preferred: CLUTTER.test(name) });
  };
  const visit = (entities, parent) => {
    for (const e of entities) {
      const t = e.components.find(c => c.type === 'TransformDefinitionComponent');
      if (!t || GROUND.test(e.name)) continue;
      for (const c of e.components) {
        if (c.type === 'ModelDefinitionComponent') add(e.name, c.filename, t.position, t.orientation, t.scale, parent);
        else if (c.type === 'ModelVariationDefinitionComponent') add(e.name, c.variations[0].filename, t.position, t.orientation, t.scale, parent);
        else if (c.type === 'PrefabPlacementDefinitionComponent') {
          const pyaw = parent?.yaw ?? 0;
          visit(readJson(c.prefab.slice(5)).entities, {
            x: parent ? parent.x + Math.cos(pyaw) * t.position.x + Math.sin(pyaw) * t.position.z : t.position.x,
            y: (parent?.y ?? 0) + t.position.y,
            z: parent ? parent.z - Math.sin(pyaw) * t.position.x + Math.cos(pyaw) * t.position.z : t.position.z,
            yaw: pyaw + quatYaw(t.orientation),
          });
        }
      }
    }
  };
  visit(preset.entities, null);
  const free = (x, z, r) => {
    for (let i = Math.floor((x - r) / GRID); i <= Math.floor((x + r) / GRID); i++)
      for (let j = Math.floor((z - r) / GRID); j <= Math.floor((z + r) / GRID); j++) {
        const cx = (i + 0.5) * GRID, cz = (j + 0.5) * GRID;
        if (Math.hypot(cx - x, cz - z) <= r + GRID * 0.71 && blocked.has(key(i, j))) return false;
      }
    return true;
  };
  return { clutter, free };
}

function anchorPos(preset, anchors, spec) {
  const [kind, name] = spec.split(/:(.*)/);
  if (kind === 'npc' || kind === 'obj') {
    const p = (kind === 'npc' ? anchors.npcs : anchors.objects)[name];
    return p ? { x: p[0], z: p[1] } : null;
  }
  const e = preset.entities.find(e => e.components.some(c =>
    c.type === 'PrefabPlacementDefinitionComponent' && c.prefab.endsWith(`/${name}.json`)));
  const t = e?.components.find(c => c.type === 'TransformDefinitionComponent').position;
  return t ? { x: t.x, z: t.z } : null;
}

function place(presetRel, anchors) {
  const preset = readJson(`hd/env/preset/${presetRel}.json`);
  const { clutter, free } = scene(preset);
  const npcs = Object.values(anchors.npcs);
  const placed = [], out = [];
  let i = 0;
  for (const [spec, props] of GROUPS[anchors.act]) {
    const at = anchorPos(preset, anchors, spec);
    if (!at) { console.warn(`  ${presetRel}: no anchor ${spec}`); continue; }
    const isObj = spec.startsWith('obj:');
    const reach = spec === 'prefab:pf_town_campfire01' ? 26 : 16;
    const nearby = clutter.filter(f => f.y < 1.5 && Math.hypot((f.box[0] + f.box[2]) / 2 - at.x, (f.box[1] + f.box[3]) / 2 - at.z) < reach);
    const groundY = nearby.length ? nearby.reduce((m, f) => m + f.y, 0) / nearby.length : 0;
    // Prefer designer clutter; else any small ground model; else a ring around
    // the anchor itself (an NPC standing in the open).
    const ring = { box: [at.x - 4, at.z - 4, at.x + 4, at.z + 4], y: groundY };
    const tiers = isObj ? [[{ box: [at.x - 2, at.z - 2, at.x + 2, at.z + 2], y: groundY }]]
      : [nearby.filter(f => f.preferred), nearby.filter(f => !f.preferred), [ring]].filter(t => t.length);
    const group = [];
    for (const [kind, s] of props) {
      const r = radius(kind, s);
      let best = null;
      for (const seeds of tiers) {
      if (best) break;
      for (const seed of seeds) {
        const cx = (seed.box[0] + seed.box[2]) / 2, cz = (seed.box[1] + seed.box[3]) / 2;
        const half = Math.max(seed.box[2] - seed.box[0], seed.box[3] - seed.box[1]) / 2;
        for (const ring of [0.35, 1.0]) for (let k = 0; k < 16; k++) {
          const ang = (k / 16) * 2 * Math.PI, dist = half + r + ring;
          const x = cx + Math.cos(ang) * dist, z = cz + Math.sin(ang) * dist;
          if (npcs.some(([nx, nz]) => Math.hypot(nx - x, nz - z) < 3.5 + r)) continue;
          if (!free(x, z, r + 0.15)) continue;
          if (placed.some(q => Math.hypot(q.x - x, q.z - z) < q.r + r + 0.5)) continue;
          const spread = group.length ? Math.min(...group.map(q => Math.hypot(q.x - x, q.z - z))) : 0;
          let score = Math.min(spread, 5) - 0.12 * Math.hypot(x - at.x, z - at.z);
          // Beside an object, prefer its screen-right (world +x, -z): visible
          // and not in front of where you click it.
          if (isObj) score += ((x - at.x) - (z - at.z)) / Math.SQRT2;
          if (!best || score > best.score) best = { x, z, y: seed.y, r, score };
        }
      }
      }
      if (!best) { console.warn(`  ${presetRel}: no spot for ${kind} at ${spec}`); continue; }
      const q = { ...best, kind, s };
      group.push(q); placed.push(q);
      // Jack-o'-lanterns face the camera (+45° from yaw 0, which faces screen
      // down-left), with a little variety; everything else any way.
      const yaw = kind === 'jack' ? 45 + ((i * 37) % 30) - 15 : (i * 97) % 360;
      out.push({ kind, x: +q.x.toFixed(2), y: +q.y.toFixed(2), z: +q.z.toFixed(2), yaw, scale: s });
      i++;
    }
  }
  return out;
}

const result = {};
for (const [presetRel, anchors] of Object.entries(ANCHORS)) {
  result[presetRel] = place(presetRel, anchors);
  console.log(`${presetRel}: ${result[presetRel].length} props`);
}
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(result, null, 1) + '\n');
