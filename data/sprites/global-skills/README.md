# Original shared skill icon sources

Copied from the local D2R CASC extraction at `D:/D2RModding/data/data`.
The runtime generator reads these bundled files; it does not need a game install.

| File | Original game path |
| --- | --- |
| `skillicon.sprite` | `data/hd/global/ui/spells/submenu/skillicon.sprite` |
| `skillicon.lowend.sprite` | `data/hd/global/ui/spells/submenu/skillicon.lowend.sprite` |
| `skillicon.dc6` | `data/global/ui/spells/skillicon.dc6` |
| `soskillicon.dc6` | `data/global/ui/spells/soskillicon.dc6` |
| `neskillicon.dc6` | `data/global/ui/spells/neskillicon.dc6` |
| `paskillicon.dc6` | `data/global/ui/spells/paskillicon.dc6` |

Refresh from an extraction with:

```powershell
node scripts/copy-global-skill-icons.mjs --dir D:/D2RModding/data
node scripts/verify-forgotten-arts.mjs --preview
```

The source HD sheets contain 40 frames; their cell pitches are 132×130 and
67×65. Derive horizontal pitch from total width / frame count. The 16-bit
field at offset 6 contains 130 or 65, not horizontal pitch.

Legacy sheets contain compressed indexed-color frames. Appending frames keeps
their original compressed data and updates the absolute pointers. HD class
artwork comes from the existing lossless PNGs in `data/sprites/icons`.
