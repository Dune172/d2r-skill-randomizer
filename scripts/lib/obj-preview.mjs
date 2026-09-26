// Tiny software rasteriser for eyeballing generated OBJ props (textured,
// Lambert-lit, z-buffered, back-face culled). Offline tooling only.
import fs from 'fs';

export function loadObj(file) {
  const v = [], vt = [], vn = [], f = [];
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const p = line.trim().split(/\s+/);
    if (p[0] === 'v') v.push(p.slice(1, 4).map(Number));
    else if (p[0] === 'vt') vt.push(p.slice(1, 3).map(Number));
    else if (p[0] === 'vn') vn.push(p.slice(1, 4).map(Number));
    else if (p[0] === 'f') f.push(p.slice(1).map(x => x.split('/').map(n => Number(n) - 1)));
  }
  return { v, vt, vn, f };
}

/**
 * Render to RGBA. yaw/pitch in radians; tex = { rgba, width, height };
 * light = extra point light { pos:[x,y,z], color:[r,g,b], range } in model space.
 */
export function render(mesh, tex, { size = 400, yaw = 0.6, pitch = 0.55, light = null, bg = [40, 44, 52] } = {}) {
  const out = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) out.set([...bg, 255], i * 4);
  const zbuf = new Float32Array(size * size).fill(Infinity);
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const view = ([x, y, z]) => {
    const x1 = cy * x + sy * z, z1 = -sy * x + cy * z;
    const y2 = cp * (y - 0.3) - sp * z1, z2 = sp * (y - 0.3) + cp * z1;
    return [x1, y2, z2];
  };
  const scale = size * 0.95, toScreen = ([x, y, z]) => [size / 2 + x * scale, size / 2 - y * scale, -z];
  const sun = (() => { const l = [-0.4, 0.8, 0.45]; const n = Math.hypot(...l); return l.map(x => x / n); })();
  const P = mesh.v.map(p => toScreen(view(p)));
  for (const face of mesh.f) {
    const [a, b, c] = face.map(i => P[i[0]]);
    const area = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
    if (area >= 0) continue; // back-facing (screen y is flipped)
    const minX = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0]))), maxX = Math.min(size - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
    const minY = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1]))), maxY = Math.min(size - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5, py = y + 0.5;
      const w0 = ((b[0] - px) * (c[1] - py) - (c[0] - px) * (b[1] - py)) / area;
      const w1 = ((c[0] - px) * (a[1] - py) - (a[0] - px) * (c[1] - py)) / area;
      const w2 = 1 - w0 - w1;
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;
      const z = w0 * a[2] + w1 * b[2] + w2 * c[2];
      const zi = y * size + x;
      if (z >= zbuf[zi]) continue;
      zbuf[zi] = z;
      const lerp = (arr, k) => face.map(i => arr[i[k]]).reduce((acc, val, j) => acc.map((s, m) => s + val[m] * [w0, w1, w2][j]), arr[face[0][k]].map(() => 0));
      const uv = lerp(mesh.vt, 1), n = lerp(mesh.vn, 2), pos = lerp(mesh.v, 0);
      const tx = Math.min(tex.width - 1, Math.max(0, Math.floor(uv[0] * tex.width)));
      const ty = Math.min(tex.height - 1, Math.max(0, Math.floor((1 - uv[1]) * tex.height)));
      const ti = (ty * tex.width + tx) * 4;
      const nl = Math.hypot(...n) || 1;
      const lambert = Math.max(0, (n[0] * sun[0] + n[1] * sun[1] + n[2] * sun[2]) / nl);
      let lit = [0.35 + 0.75 * lambert, 0.35 + 0.75 * lambert, 0.35 + 0.75 * lambert];
      if (light) {
        const d = light.pos.map((q, m) => q - pos[m]);
        const dist = Math.hypot(...d) || 1;
        const k = Math.max(0, (n[0] * d[0] + n[1] * d[1] + n[2] * d[2]) / (nl * dist)) * Math.max(0, 1 - dist / light.range);
        lit = lit.map((s, m) => s + k * light.color[m]);
      }
      for (let m = 0; m < 3; m++) out[zi * 4 + m] = Math.min(255, tex.rgba[ti + m] * lit[m]);
    }
  }
  return out;
}
