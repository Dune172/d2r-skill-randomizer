"""Transplant an OBJ mesh into a vanilla D2R model (offline tooling).

d2rpp's OBJImport builds a bare mesh with no model, skeleton, bone binding,
D2R material maps or VertexScale/bbox extended data, and D2R skips such files.
Instead, take a vanilla static single-mesh prop as a template (decompressed to
raw 64-bit GR2) and overwrite its mesh data in place: vertices, indices, counts,
bounds and VertexScale. Array counts are u32 fields in the parent structs, so a
smaller mesh fits inside the template's allocations with no re-layout; every
structural byte stays exactly as the game shipped it.

    python gr2patch.py template_raw.gr2 mesh.obj out_raw.gr2

Vertex layout required (all vanilla static props checked): Position Int16x4
(xyz = coord / template VertexScale * 32767, w = template constant), Normal Int8x4,
Tangent Int8x4 (w = handedness), TextureCoordinates0 Real16x2 with V top-down
(1 - OBJ v; d2rpp's OBJ dump flips it back). Afterwards rename
textures with `d2rpp RenameElement` and recompress with `d2rpp Compress`.
"""
import math
import struct
import sys

sys.path.insert(0, __file__.rsplit('\\', 1)[0] if '\\' in __file__ else __file__.rsplit('/', 1)[0])
from gr2dump import Gr2, T_INLINE, T_REF, T_REFARRAY, T_ARRAYREFS, T_VARREF, T_REFVARARRAY  # noqa: E402

VERTEX_KEYS = ['Position', 'Normal', 'Tangent', 'TextureCoordinates0']


class Patcher(Gr2):
    def field(self, tdef, at, name):
        """(type, definition, arraySize, address) of a named member of the struct at `at`."""
        for typ, n, definition, arr in self.members(tdef):
            if n == name:
                return typ, definition, arr, at
            one = {T_INLINE: None, T_REF: 8, T_REFARRAY: 12, T_ARRAYREFS: 12, T_VARREF: 16, T_REFVARARRAY: 20,
                   8: 8, 9: 68, 22: 8}.get(typ)
            if one is None:
                one = self.size(definition) if typ == T_INLINE else {10: 4, 11: 1, 12: 1, 13: 1, 14: 1, 15: 2, 16: 2, 17: 2,
                                                                     18: 2, 19: 4, 20: 4, 21: 2}[typ]
            at += one * max(1, arr)
        raise KeyError(name)

    def element(self, typ, definition, addr, i):
        """(typeDef, address) of element i of an array member at addr."""
        if typ == T_REFARRAY:
            return definition, self.p(addr + 4) + i * self.size(definition)
        if typ == T_ARRAYREFS:
            return definition, self.p(self.p(addr + 4) + 8 * i)
        raise TypeError(typ)

    def ref(self, typ, definition, addr):
        if typ == T_REF:
            return definition, self.p(addr)
        if typ == T_VARREF:
            return self.p(addr), self.p(addr + 8)
        raise TypeError(typ)


def load_obj(path):
    v, vt, vn, faces = [], [], [], []
    for line in open(path):
        p = line.split()
        if not p:
            continue
        if p[0] == 'v':
            v.append(tuple(map(float, p[1:4])))
        elif p[0] == 'vt':
            vt.append(tuple(map(float, p[1:3])))
        elif p[0] == 'vn':
            vn.append(tuple(map(float, p[1:4])))
        elif p[0] == 'f':
            faces.append(tuple(tuple(int(x) - 1 for x in c.split('/')) for c in p[1:4]))
    # Unroll to unique (v, vt, vn) triples.
    index, verts, tris = {}, [], []
    for f in faces:
        tri = []
        for key in f:
            if key not in index:
                index[key] = len(verts)
                verts.append((v[key[0]], vt[key[1]], vn[key[2]]))
            tri.append(index[key])
        tris.append(tri)
    return verts, tris


def tangents(verts, tris):
    tan = [[0.0, 0.0, 0.0] for _ in verts]
    bit = [[0.0, 0.0, 0.0] for _ in verts]
    for a, b, c in tris:
        (p0, t0, _), (p1, t1, _), (p2, t2, _) = verts[a], verts[b], verts[c]
        e1 = [p1[i] - p0[i] for i in range(3)]
        e2 = [p2[i] - p0[i] for i in range(3)]
        du1, dv1, du2, dv2 = t1[0] - t0[0], t1[1] - t0[1], t2[0] - t0[0], t2[1] - t0[1]
        r = du1 * dv2 - du2 * dv1
        if abs(r) < 1e-12:
            continue
        r = 1.0 / r
        sdir = [(dv2 * e1[i] - dv1 * e2[i]) * r for i in range(3)]
        tdir = [(du1 * e2[i] - du2 * e1[i]) * r for i in range(3)]
        for k in (a, b, c):
            for i in range(3):
                tan[k][i] += sdir[i]
                bit[k][i] += tdir[i]
    out = []
    for k, (_, _, n) in enumerate(verts):
        t = tan[k]
        d = sum(n[i] * t[i] for i in range(3))
        t = [t[i] - n[i] * d for i in range(3)]  # Gram-Schmidt
        ln = math.sqrt(sum(x * x for x in t))
        if ln < 1e-9:
            t = [1.0, 0.0, 0.0] if abs(n[0]) < 0.9 else [0.0, 0.0, 1.0]
            d = sum(n[i] * t[i] for i in range(3))
            t = [t[i] - n[i] * d for i in range(3)]
            ln = math.sqrt(sum(x * x for x in t))
        t = [x / ln for x in t]
        cr = [n[1] * t[2] - n[2] * t[1], n[2] * t[0] - n[0] * t[2], n[0] * t[1] - n[1] * t[0]]
        w = -1 if sum(cr[i] * bit[k][i] for i in range(3)) < 0 else 1
        out.append((t, w))
    return out


def clamp8(x):
    return max(-127, min(127, int(round(x * 127))))


def patch(template, obj, out):
    g = Patcher(bytearray(open(template, 'rb').read()))
    d = g.d
    verts, tris = load_obj(obj)
    tans = tangents(verts, tris)

    # root.Meshes[0]
    typ, df, _, addr = g.field(g.root_type, g.root, 'Meshes')
    if struct.unpack_from('<I', d, addr)[0] != 1:
        raise ValueError('template must have exactly one mesh')
    mdef, mesh = g.element(typ, df, addr, 0)

    # Vertices (RefVarArray: typeDef ptr, u32 count, data ptr)
    t, df, _, a = g.field(mdef, mesh, 'PrimaryVertexData')
    vddef, vd = g.ref(t, df, a)
    t, df, _, va = g.field(vddef, vd, 'Vertices')
    vtype, vcount, vdata = g.p(va), struct.unpack_from('<I', d, va + 8)[0], g.p(va + 12)
    names = [m[1] for m in g.members(vtype)]
    if names != VERTEX_KEYS:
        raise ValueError('unexpected vertex layout %r' % names)
    stride = g.size(vtype)
    if stride != 20:
        raise ValueError('unexpected vertex stride %d' % stride)
    if len(verts) > vcount:
        raise ValueError('mesh has %d vertices; template only %d' % (len(verts), vcount))
    pos_w = struct.unpack_from('<h', d, vdata + 6)[0]

    # Topology
    t, df, _, a = g.field(mdef, mesh, 'PrimaryTopology')
    tdef, topo = g.ref(t, df, a)
    t, df, _, ga = g.field(tdef, topo, 'Groups')
    if struct.unpack_from('<I', d, ga)[0] != 1:
        raise ValueError('template must have one triangle group')
    gdef, grp = g.element(t, df, ga, 0)
    _, _, _, tri_first = g.field(gdef, grp, 'TriFirst')
    _, _, _, tri_count = g.field(gdef, grp, 'TriCount')
    t, df, _, ia = g.field(tdef, topo, 'Indices16')
    icount, idata = struct.unpack_from('<I', d, ia)[0], g.p(ia + 4)
    if len(tris) * 3 > icount:
        raise ValueError('mesh has %d triangles; template only %d' % (len(tris), icount // 3))
    # Side tables would describe the template's old topology; drop them.
    for name in ['Indices', 'VertexToVertexMap', 'VertexToTriangleMap', 'SideToNeighborMap', 'PolygonIndexStarts',
                 'PolygonIndices', 'BonesForTriangle', 'TriangleToBoneIndices']:
        try:
            _, _, _, a = g.field(tdef, topo, name)
            struct.pack_into('<I', d, a, 0)
        except KeyError:
            pass

    # Bounds and quantisation scale.
    xs, ys, zs = zip(*(p for p, _, _ in verts))
    bmin, bmax = [min(xs), min(ys), min(zs)], [max(xs), max(ys), max(zs)]
    # Quantise against the TEMPLATE's VertexScale and leave it (and the
    # position w constant) untouched. In game, rewriting VertexScale had no
    # effect: meshes rendered at template_scale / our_scale times their size,
    # so the engine derives dequantisation from data we don't rewrite. Keeping
    # the template's scale makes coordinates come out exactly as authored.
    t, df, _, a = g.field(mdef, mesh, 'ExtendedData')
    edef, ext = g.ref(t, df, a)
    _, _, _, scale_at = g.field(edef, ext, 'VertexScale')
    scale = struct.unpack_from('<f', d, scale_at)[0]
    if max(abs(c) for c in bmin + bmax) > scale:
        raise ValueError('mesh extent exceeds template VertexScale %.3f' % scale)

    for i, ((p, uv, n), (tn, w)) in enumerate(zip(verts, tans)):
        o = vdata + i * stride
        struct.pack_into('<4h', d, o, *(int(round(c / scale * 32767)) for c in p), pos_w)
        ln = math.sqrt(sum(c * c for c in n)) or 1.0
        struct.pack_into('<4b', d, o + 8, *(clamp8(c / ln) for c in n), 0)
        struct.pack_into('<4b', d, o + 12, *(clamp8(c) for c in tn), 127 * w)
        # Stored V runs top-down (DirectX); OBJ V runs bottom-up.
        struct.pack_into('<2e', d, o + 16, uv[0], 1.0 - uv[1])
    struct.pack_into('<I', d, va + 8, len(verts))
    for i, tri in enumerate(tris):
        struct.pack_into('<3H', d, idata + 6 * i, *tri)
    struct.pack_into('<I', d, ia, len(tris) * 3)
    struct.pack_into('<I', d, tri_first, 0)
    struct.pack_into('<I', d, tri_count, len(tris))

    # Mesh ExtendedData bounds (VertexScale deliberately kept, see above).
    for name, vals in (('bbMin', bmin), ('bbMax', bmax)):
        _, _, _, a = g.field(edef, ext, name)
        struct.pack_into('<3f', d, a, *vals)

    # BoneBindings[0] oriented bounding box.
    t, df, _, a = g.field(mdef, mesh, 'BoneBindings')
    bdef, bb = g.element(t, df, a, 0)
    for name, vals in (('OBBMin', bmin), ('OBBMax', bmax)):
        _, _, _, a = g.field(bdef, bb, name)
        struct.pack_into('<3f', d, a, *vals)
    # Stale per-triangle bone lists from the template.
    _, _, _, a = g.field(bdef, bb, 'TriangleIndices')
    struct.pack_into('<I', d, a, 0)

    open(out, 'wb').write(bytes(d))
    return dict(verts=len(verts), tris=len(tris), scale=scale, bmin=bmin, bmax=bmax, template_verts=vcount,
                template_tris=icount // 3)


if __name__ == '__main__':
    print(patch(sys.argv[1], sys.argv[2], sys.argv[3]))


def hide_bones(src, out, bone_patterns, whole_meshes):
    """Hide the parts of a skinned model driven by some bones, in place.

    Meshes named in `whole_meshes` (prefix match) lose all their triangles;
    every other mesh loses the triangles touching a vertex whose dominant
    bone matches `bone_patterns`. Only index lists and counts change, so
    skinning, skeleton, materials and the remaining geometry stay vanilla.
    Returns {mesh name: (triangles before, after)}.
    """
    import re
    g = Patcher(bytearray(open(src, 'rb').read()))
    d = g.d
    bone_re = re.compile('|'.join(bone_patterns))
    typ, df, _, addr = g.field(g.root_type, g.root, 'Meshes')
    n_meshes = struct.unpack_from('<I', d, addr)[0]
    report = {}
    for mi in range(n_meshes):
        mdef, mesh = g.element(typ, df, addr, mi)
        _, _, _, na = g.field(mdef, mesh, 'Name')
        name = g.cstr(g.p(na))
        t, tdf, _, a = g.field(mdef, mesh, 'PrimaryTopology')
        tdef, topo = g.ref(t, tdf, a)
        t, gdf, _, ga = g.field(tdef, topo, 'Groups')
        gdef, grp = g.element(t, gdf, ga, 0)
        _, _, _, tri_count = g.field(gdef, grp, 'TriCount')
        _, _, _, ia = g.field(tdef, topo, 'Indices16')
        icount, idata = struct.unpack_from('<I', d, ia)[0], g.p(ia + 4)
        before = icount // 3
        if struct.unpack_from('<I', d, ga)[0] != 1 or icount == 0:
            continue
        if any(name.startswith(w) for w in whole_meshes):
            keep = []
        else:
            # Dominant bone per vertex -> hidden?
            t, vdf, _, a = g.field(mdef, mesh, 'PrimaryVertexData')
            vddef, vd = g.ref(t, vdf, a)
            _, _, _, va = g.field(vddef, vd, 'Vertices')
            vtype, vcount, vdata = g.p(va), struct.unpack_from('<I', d, va + 8)[0], g.p(va + 12)
            stride = g.size(vtype)
            offs = {}
            o = 0
            for mt, mn, mdf2, arr in g.members(vtype):
                offs[mn] = o
                o += {12: 1, 11: 1, 13: 1, 14: 1, 15: 2, 16: 2, 17: 2, 18: 2, 10: 4, 21: 2}[mt] * max(1, arr)
            if 'BoneWeights' not in offs:
                continue
            t, bdf, _, ba = g.field(mdef, mesh, 'BoneBindings')
            nb = struct.unpack_from('<I', d, ba)[0]
            bone_names = []
            for bi in range(nb):
                bdef, bb = g.element(t, bdf, ba, bi)
                _, _, _, bna = g.field(bdef, bb, 'BoneName')
                bone_names.append(g.cstr(g.p(bna)))
            hidden = []
            for vi in range(vcount):
                base = vdata + vi * stride
                w = d[base + offs['BoneWeights']: base + offs['BoneWeights'] + 4]
                ix = d[base + offs['BoneIndices']: base + offs['BoneIndices'] + 4]
                k = max(range(4), key=lambda j: w[j])
                hidden.append(bool(bone_re.search(bone_names[ix[k]])))
            tris = [struct.unpack_from('<3H', d, idata + 6 * t_) for t_ in range(before)]
            keep = [tr for tr in tris if not any(hidden[v] for v in tr)]
        for i, tr in enumerate(keep):
            struct.pack_into('<3H', d, idata + 6 * i, *tr)
        struct.pack_into('<I', d, ia, len(keep) * 3)
        struct.pack_into('<I', d, tri_count, len(keep))
        report[name] = (before, len(keep))
    open(out, 'wb').write(bytes(d))
    return report
