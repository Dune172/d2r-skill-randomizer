"""Extract town NPC spawn spots and key objects from the legacy DS1 maps into
data/autumn/town-anchors.json, in HD preset coordinates (offline tooling).

    python scripts/extract-town-anchors.py [D2R data root]

Each HD town preset (data/hd/env/preset/...json) mirrors a DS1 of the same
name; HD units = 2 x DS1 subtile (+1 to centre on the subtile). DS1 objects of
type 1 index monpreset.txt rows for that act (NPC spawns); type 2 index
objpreset.txt by its Index column for that act ('Bank' is the stash).
"""
import json
import os
import struct
import sys

ROOT = sys.argv[1] if len(sys.argv) > 1 else 'D:/D2RModding/data/data'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'autumn', 'town-anchors.json')

TOWNS = [  # (act, DS1 relative to global/tiles, HD preset relative to hd/env/preset)
    (1, 'act1/town/towne1', 'act1/town/towne1'),
    (1, 'act1/town/townn1', 'act1/town/townn1'),
    (1, 'act1/town/towns1', 'act1/town/towns1'),
    (1, 'act1/town/townw1', 'act1/town/townw1'),
    (2, 'act2/town/lutn', 'act2/town/lutn'),
    (2, 'act2/town/lutw', 'act2/town/lutw'),
    (3, 'act3/docktown/docktown3', 'act3/docktown/docktown3'),
    (4, 'act4/fort/fortress', 'act4/fort/fortress'),
    (5, 'expansion/town/townwest', 'expansion/town/townwest'),
]
# Town objects worth anchoring decorations to.
OBJECTS = {'Bank': 'stash'}
SKIP_NPCS = {'chicken', 'rogue1', 'rogue3', 'cow', 'camel', 'navi', 'place_nothing', 'bird1', 'bird2', 'bat', 'rat',
             'cat', 'dog', 'wolf', 'bug', 'seagull', 'fish', 'jungle_fly', 'act2guard1', 'act2guard2', 'act2guard3',
             'act3male', 'act3female', 'act5barb', 'act5pow'}


def table(name):
    rows = []
    with open(os.path.join(ROOT, 'global/excel', name), encoding='latin1') as f:
        header = f.readline().rstrip('\r\n').split('\t')
        for line in f:
            rows.append(dict(zip(header, line.rstrip('\r\n').split('\t'))))
    return rows


def parse_ds1(path):
    d = open(path, 'rb').read()
    o = 0

    def i32():
        nonlocal o
        v = struct.unpack_from('<i', d, o)[0]
        o += 4
        return v
    v = i32()
    w, h = i32() + 1, i32() + 1
    if v >= 8:
        i32()
    tag = i32() if v >= 10 else 0
    if v >= 3:
        for _ in range(i32()):
            o = d.index(b'\0', o) + 1
    if 9 <= v <= 13:
        o += 8
    walls = i32()
    floors = i32() if v >= 16 else 1
    o += (walls * 2 + floors + 1 + (1 if tag in (1, 2) else 0)) * w * h * 4
    objs = []
    for _ in range(i32()):
        t, i, x, y = struct.unpack_from('<4i', d, o)
        o += 16 + (4 if v > 5 else 0)
        objs.append((t, i, x, y))
    return objs


def main():
    monpreset = table('monpreset.txt')
    objpreset = table('objpreset.txt')
    out = {}
    for act, ds1, preset in TOWNS:
        npcs_by_idx = [r['Place'] for r in monpreset if r.get('Act') == str(act)]
        objs_by_idx = {int(r['Index']): r['ObjectClass'] for r in objpreset if r.get('Act') == str(act)}
        npcs, objects = {}, {}
        for t, i, x, y in parse_ds1(os.path.join(ROOT, 'global/tiles', ds1 + '.ds1')):
            hd = [2 * x + 1, 2 * y + 1]
            if t == 1 and 0 <= i < len(npcs_by_idx):
                name = npcs_by_idx[i]
                if name not in SKIP_NPCS and not name.startswith('place_'):
                    npcs.setdefault(name, hd)
            elif t == 2 and objs_by_idx.get(i) in OBJECTS:
                objects[OBJECTS[objs_by_idx[i]]] = hd
        out[preset] = {'act': act, 'npcs': npcs, 'objects': objects}
        print(preset, npcs, objects)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w') as f:
        json.dump(out, f, indent=1, sort_keys=True)
        f.write('\n')


if __name__ == '__main__':
    main()
