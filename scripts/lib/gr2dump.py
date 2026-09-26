"""Minimal Granny (.gr2, uncompressed, 64-bit LE) reader for diffing D2R models.

Offline tooling. Decompress D2R .model files first with d2rpp:
    d2rpp Decompress in.model -output out.gr2
Then:
    python scripts/lib/gr2dump.py out.gr2 [maxArray]

Format per lslib's GR2 reader: 16-byte magic, header, file info (v7), section
headers (44 bytes each), per-section relocation tables that turn in-file
pointers into (section, offset) targets, and a self-describing type tree.
"""
import struct
import sys

MAGIC_LE64 = bytes.fromhex('E59B495E6F631F141E13EBA990BEEDC4')
T_END, T_INLINE, T_REF, T_REFARRAY, T_ARRAYREFS, T_VARREF, _, T_REFVARARRAY, T_STRING, T_TRANSFORM, T_REAL32, \
    T_INT8, T_UINT8, T_BINORMINT8, T_NORMUINT8, T_INT16, T_UINT16, T_BINORMINT16, T_NORMUINT16, T_INT32, T_UINT32, \
    T_REAL16, T_EMPTYREF = range(23)
SCALAR = {T_REAL32: ('<f', 4), T_INT8: ('<b', 1), T_UINT8: ('<B', 1), T_BINORMINT8: ('<b', 1), T_NORMUINT8: ('<B', 1),
          T_INT16: ('<h', 2), T_UINT16: ('<H', 2), T_BINORMINT16: ('<h', 2), T_NORMUINT16: ('<H', 2),
          T_INT32: ('<i', 4), T_UINT32: ('<I', 4), T_REAL16: ('<e', 2)}
NAMES = {v: k for k, v in dict(END=0, Inline=1, Ref=2, RefArray=3, ArrayOfRefs=4, VarRef=5, RefVarArray=7, String=8,
                               Transform=9, Real32=10, Int8=11, UInt8=12, BinormalInt8=13, NormalUInt8=14, Int16=15,
                               UInt16=16, BinormalInt16=17, NormalUInt16=18, Int32=19, UInt32=20, Real16=21,
                               EmptyRef=22).items()}


class Gr2:
    def __init__(self, data):
        if data[:16] != MAGIC_LE64:
            raise ValueError('not an uncompressed little-endian 64-bit GR2 (decompress with d2rpp first)')
        self.d = data
        hdr_size = struct.unpack_from('<I', data, 16)[0]
        info = 32
        (self.version, total, crc, sec_off, nsec, rt_s, rt_o, rn_s, rn_o, tag) = struct.unpack_from('<10I', data, info)
        self.sections = []
        base = info + sec_off
        for i in range(nsec):
            (comp, doff, dsize, usize, align, f16, f8, roff, nrel, moff, nmix) = struct.unpack_from('<11I', data, base + 44 * i)
            if comp:
                raise ValueError('section %d is compressed' % i)
            self.sections.append(dict(off=doff, size=dsize, roff=roff, nrel=nrel))
        # Pointer targets keyed by absolute file offset of the pointer slot.
        self.ptr = {}
        for s in self.sections:
            for r in range(s['nrel']):
                o, ts, to = struct.unpack_from('<3I', data, s['roff'] + 12 * r)
                self.ptr[s['off'] + o] = self.sections[ts]['off'] + to
        self.root_type = self.sections[rt_s]['off'] + rt_o
        self.root = self.sections[rn_s]['off'] + rn_o

    def p(self, at):
        return self.ptr.get(at)

    def cstr(self, at):
        if at is None:
            return None
        end = self.d.index(b'\0', at)
        return self.d[at:end].decode('latin1')

    def members(self, tdef):
        out = []
        at = tdef
        while True:
            typ = struct.unpack_from('<I', self.d, at)[0]
            if typ == T_END:
                return out
            name = self.cstr(self.p(at + 4))
            definition = self.p(at + 12)
            arr = struct.unpack_from('<I', self.d, at + 20)[0]
            out.append((typ, name, definition, arr))
            at += 44

    def size(self, tdef):
        n = 0
        for typ, _, definition, arr in self.members(tdef):
            one = {T_INLINE: None, T_REF: 8, T_REFARRAY: 12, T_ARRAYREFS: 12, T_VARREF: 16, T_REFVARARRAY: 20,
                   T_STRING: 8, T_TRANSFORM: 68, T_EMPTYREF: 8}.get(typ)
            if one is None:
                one = self.size(definition) if typ == T_INLINE else SCALAR[typ][1]
            n += one * max(1, arr)
        return n

    def read(self, tdef, at, depth, max_arr, seen):
        out = {}
        for typ, name, definition, arr in self.members(tdef):
            vals = []
            for k in range(max(1, arr)):
                v, at = self.read_member(typ, definition, at, depth, max_arr, seen)
                vals.append(v)
            out[name] = vals if arr > 0 else vals[0]
        return out, at

    def read_member(self, typ, definition, at, depth, max_arr, seen):
        d = self.d
        if typ in SCALAR:
            fmt, sz = SCALAR[typ]
            return struct.unpack_from(fmt, d, at)[0], at + sz
        if typ == T_STRING:
            return self.cstr(self.p(at)), at + 8
        if typ == T_TRANSFORM:
            v = struct.unpack_from('<I16f', d, at)
            return dict(flags=v[0], t=v[1:4], r=v[4:8], ss=v[8:17]), at + 68
        if typ == T_INLINE:
            return self.read(definition, at, depth, max_arr, seen)
        if typ == T_EMPTYREF:
            return '<empty>', at + 8
        if depth <= 0:
            return '...', at + {T_REF: 8, T_REFARRAY: 12, T_ARRAYREFS: 12, T_VARREF: 16, T_REFVARARRAY: 20}[typ]
        if typ == T_REF:
            tgt = self.p(at)
            return (self.obj(definition, tgt, depth - 1, max_arr, seen) if tgt is not None else None), at + 8
        if typ == T_REFARRAY:
            n = struct.unpack_from('<I', d, at)[0]
            tgt = self.p(at + 4)
            items, sz = [], self.size(definition)
            for i in range(min(n, max_arr)):
                items.append(self.obj(definition, tgt + i * sz, depth - 1, max_arr, seen)[0] if tgt is not None else None)
            return dict(count=n, items=items), at + 12
        if typ == T_ARRAYREFS:
            n = struct.unpack_from('<I', d, at)[0]
            tgt = self.p(at + 4)
            items = []
            for i in range(min(n, max_arr)):
                q = self.p(tgt + 8 * i) if tgt is not None else None
                items.append(self.obj(definition, q, depth - 1, max_arr, seen)[0] if q is not None else None)
            return dict(count=n, items=items), at + 12
        if typ == T_VARREF:
            tdef, obj = self.p(at), self.p(at + 8)
            return (self.obj(tdef, obj, depth - 1, max_arr, seen)[0] if tdef and obj else None), at + 16
        if typ == T_REFVARARRAY:
            tdef = self.p(at)
            n = struct.unpack_from('<I', d, at + 8)[0]
            tgt = self.p(at + 12)
            items = []
            if tdef and tgt is not None:
                sz = self.size(tdef)
                for i in range(min(n, max_arr)):
                    items.append(self.obj(tdef, tgt + i * sz, depth - 1, max_arr, seen)[0])
            return dict(count=n, items=items), at + 20
        raise ValueError('unknown member type %d' % typ)

    def obj(self, tdef, at, depth, max_arr, seen):
        key = (tdef, at)
        if key in seen:
            return '<cycle>', at
        seen = seen | {key}
        return self.read(tdef, at, depth, max_arr, seen)

    def schema(self, tdef, indent=0, seen=()):
        lines = []
        for typ, name, definition, arr in self.members(tdef):
            lines.append('%s%s: %s%s' % ('  ' * indent, name, NAMES.get(typ, typ), '[%d]' % arr if arr else ''))
            if definition and definition not in seen and indent < 6:
                lines += self.schema(definition, indent + 1, seen + (definition,))
        return lines


def dump(obj, indent=0, out=None):
    out = [] if out is None else out
    pad = '  ' * indent
    if isinstance(obj, dict):
        for k, v in obj.items():
            if isinstance(v, (dict, list)) and v:
                out.append('%s%s:' % (pad, k))
                dump(v, indent + 1, out)
            else:
                out.append('%s%s: %r' % (pad, k, v))
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            if isinstance(v, (dict, list)):
                out.append('%s[%d]' % (pad, i))
                dump(v, indent + 1, out)
            else:
                out.append('%s[%d] %r' % (pad, i, v))
    return out


if __name__ == '__main__':
    g = Gr2(open(sys.argv[1], 'rb').read())
    max_arr = int(sys.argv[2]) if len(sys.argv) > 2 else 3
    if '--schema' in sys.argv:
        print('\n'.join(g.schema(g.root_type)))
    else:
        root, _ = g.obj(g.root_type, g.root, 12, max_arr, frozenset())
        print('\n'.join(dump(root)))
