"""Bounding boxes of the HD models used in town presets (offline tooling).

    python scripts/lib/model_bounds.py <d2rpp.exe> <cache.json> <preset.json>...

For every model referenced by the given presets (prefab contents included) it
decompresses the lod0 file with d2rpp and records the union of its meshes'
ExtendedData bbMin/bbMax. Results are cached by model path, so reruns only
decompress models it has not seen. Used by the prop placer to keep
decorations out of solid footprints (fire rings, walls, carts, stalls).
"""
import json
import os
import subprocess
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gr2dump import Gr2  # noqa: E402

ROOT = 'D:/D2RModding/data/data'


def models_in(preset_path, seen_prefabs):
    d = json.load(open(preset_path, encoding='utf-8'))
    found = set()
    for e in d.get('entities', []):
        for c in e['components']:
            if c['type'] == 'ModelDefinitionComponent':
                found.add(c['filename'])
            elif c['type'] == 'ModelVariationDefinitionComponent':
                found.update(v['filename'] for v in c['variations'])
            elif c['type'] == 'PrefabPlacementDefinitionComponent' and c['prefab'] not in seen_prefabs:
                seen_prefabs.add(c['prefab'])
                found |= models_in(os.path.join(ROOT, c['prefab'][5:]), seen_prefabs)
    return found


CELL = 0.5          # occupancy grid resolution (HD units)
BAND = (0.25, 2.0)  # heights that block a ground prop: walls, stalls, rails
LARGE = 6.0         # footprint side above which a box is too coarse


def solid_cells(g, root):
    """Ground-level occupancy of a model: cells (model-local, CELL units) where
    STEEP triangle surface (walls, sides, posts) lies within BAND above the
    model origin. Flat and gently sloped surfaces (floors, platforms, ramps,
    roofs) never block, whatever their height relative to the origin."""
    cells = set()
    for m in root['Meshes']['items']:
        if not m:
            continue
        ext = m.get('ExtendedData')
        ext = ext[0] if isinstance(ext, tuple) else ext
        scale = (ext or {}).get('VertexScale', 1.0)
        pvd = m['PrimaryVertexData']
        pvd = pvd[0] if isinstance(pvd, tuple) else pvd
        pos = []
        for v in pvd['Vertices']['items']:
            p = v.get('Position')
            if p is None:
                return None
            if isinstance(p[0], int):  # BinormalInt16: quantised by VertexScale
                pos.append((p[0] / 32767 * scale, p[1] / 32767 * scale, p[2] / 32767 * scale))
            else:
                pos.append(tuple(p[:3]))
        topo = m['PrimaryTopology']
        topo = topo[0] if isinstance(topo, tuple) else topo
        idx = [x['Int16'] & 0xffff for x in topo['Indices16']['items']] or [x['Int32'] for x in topo['Indices']['items']]
        for t in range(0, len(idx) - 2, 3):
            a, b, c = pos[idx[t]], pos[idx[t + 1]], pos[idx[t + 2]]
            if max(a[1], b[1], c[1]) < BAND[0] or min(a[1], b[1], c[1]) > BAND[1]:
                continue
            ux, uy, uz = b[0] - a[0], b[1] - a[1], b[2] - a[2]
            vx, vy, vz = c[0] - a[0], c[1] - a[1], c[2] - a[2]
            nx, ny, nz = uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx
            ln = (nx * nx + ny * ny + nz * nz) ** 0.5
            if ln == 0 or abs(ny) / ln > 0.7:  # flat-ish: floor, platform, roof
                continue
            edge = max(abs(a[0] - b[0]) + abs(a[2] - b[2]), abs(b[0] - c[0]) + abs(b[2] - c[2]), abs(a[0] - c[0]) + abs(a[2] - c[2]),
                       abs(a[1] - b[1]), abs(b[1] - c[1]), abs(a[1] - c[1]))
            n = max(1, int(edge / (CELL / 2)) + 1)
            for i in range(n + 1):
                for j in range(n + 1 - i):
                    u, w = i / n, j / n
                    y = a[1] + u * (b[1] - a[1]) + w * (c[1] - a[1])
                    if BAND[0] <= y <= BAND[1]:
                        x = a[0] + u * (b[0] - a[0]) + w * (c[0] - a[0])
                        z = a[2] + u * (b[2] - a[2]) + w * (c[2] - a[2])
                        cells.add((int(x // CELL), int(z // CELL)))
    return sorted(cells)


def bounds(d2rpp, model, tmp):
    lod0 = os.path.join(ROOT, model[5:].replace('.model', '_lod0.model'))
    if not os.path.exists(lod0):
        lod0 = os.path.join(ROOT, model[5:])
        if not os.path.exists(lod0):
            return None
    if subprocess.run([d2rpp, 'Decompress', lod0, '-output', tmp], capture_output=True).returncode:
        return None
    try:
        g = Gr2(open(tmp, 'rb').read())
        root, _ = g.obj(g.root_type, g.root, 4, 64, frozenset())
    except Exception:
        return None
    box = box_of(root)
    if box is None:
        return None
    if max(box[3] - box[0], box[5] - box[2]) <= LARGE:
        return box
    try:
        full, _ = g.obj(g.root_type, g.root, 6, 10 ** 7, frozenset())
        cells = solid_cells(g, full)
    except Exception as e:
        print('  no cells for %s: %r' % (model, e), file=sys.stderr)
        cells = None
    return {'box': box, 'cell': CELL, 'cells': cells}


def box_of(root):
    lo, hi = [float('inf')] * 3, [float('-inf')] * 3
    for m in root['Meshes']['items']:
        ext = m.get('ExtendedData') if m else None
        ext = ext[0] if isinstance(ext, tuple) else ext
        if not ext or 'bbMin' not in ext:
            continue
        lo = [min(a, b) for a, b in zip(lo, ext['bbMin'])]
        hi = [max(a, b) for a, b in zip(hi, ext['bbMax'])]
    return None if lo[0] == float('inf') else [round(v, 3) for v in lo + hi]


def main():
    d2rpp, cache_path, presets = sys.argv[1], sys.argv[2], sys.argv[3:]
    cache = json.load(open(cache_path)) if os.path.exists(cache_path) else {}
    models = set()
    for p in presets:
        models |= models_in(p, set())
    # Re-measure large models (occupancy rules may have changed) and new ones.
    todo = sorted(m for m in models if m not in cache or isinstance(cache[m], dict)
                  or (isinstance(cache[m], list) and max(cache[m][3] - cache[m][0], cache[m][5] - cache[m][2]) > LARGE))
    tmp = os.path.join(tempfile.gettempdir(), 'd2rr_bounds.gr2')
    for i, m in enumerate(todo):
        cache[m] = bounds(d2rpp, m, tmp)
        if i % 50 == 0:
            print('%d/%d' % (i, len(todo)), file=sys.stderr)
    json.dump(cache, open(cache_path, 'w'), indent=0, sort_keys=True)
    print('%d models, %d new, %d without bounds' % (len(models), len(todo), sum(1 for m in models if cache.get(m) is None)))


if __name__ == '__main__':
    main()
