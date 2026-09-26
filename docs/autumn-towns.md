# Autumn Towns (seasonal HD overlay)

Every mod generated in October or November (America/Los_Angeles) includes
`data/autumn/overlay.zip`, copied into the mod's `data/` folder. It is purely
visual and HD-only:

- pumpkins, jack-o'-lanterns (candle flame + light) and corn stalks in all five
  towns, placed beside existing clutter near NPCs, the stash and camp props;
  no collision
- Act 1 outdoors (town, wilderness, Tristram): recoloured maple, hawthorn and
  witch hazel leaves, recoloured fallen-leaf decals plus leaf clutter on grass,
  straw-tinted grass, a warm colour-grading LUT, warmer key light and fog,
  stronger wind (screen-space drifting leaves were tried and dropped: too much)

Runtime: `src/lib/autumn/season.ts` (month gate, recurs every year;
`D2RR_AUTUMN=1|0` forces it for previews and tests), `src/lib/autumn/overlay.ts`
(lazy loader + cache tag), `zip-builder` `autumnFiles`. It adds about 11 MB
(compressed) per download.

## Staying correct across years and game patches

The overlay holds modified copies of vanilla files. `overlay.zip` carries
`_autumn_manifest.json` with the `DataVersionBuild` it was built for and a SHA-1
of every vanilla source file it used. Safeguards:

- **Runtime:** the server ships the overlay only while
  `data/dataversionbuild.txt` matches the manifest. After a game patch (when that
  file is bumped) autumn is skipped with a `[autumn]` warning in the server log
  rather than overwriting patched game files with stale copies.
- **Cache:** in season the ZIP cache key includes a hash of `overlay.zip`
  (`:autumn-<hash>`, or `:autumn-off` when skipped). Rebuilding or disabling the
  overlay never serves a stale cached mod, and no `PIPELINE_VERSION` bump is needed.
- **Verify:** `node scripts/verify-autumn.mjs` fails when the stamp is stale. With
  `--src <fresh extraction>` it also names every vanilla source that changed.

**Before each October** (or after any D2R patch), re-extract the game files, run
`verify-autumn --src`, and if it fails, rebuild with the steps below.

## Rebuilding the overlay (offline)

Needs a CASC extraction (`scripts/extract-casc.ps1`, default
`D:/D2RModding/data/data`), Python, and `d2rpp.exe` from Bonesy's D2R MoPaH
(d2rmodding.com/modtools). None of these are needed at runtime.

```
node scripts/build-autumn-assets.mjs --d2rpp <d2rpp.exe>          # pumpkin/jack models + textures -> data/autumn/assets
node scripts/build-autumn-foliage.mjs                             # leaf recolours -> data/autumn/foliage (gitignored)
python scripts/extract-town-anchors.py                            # NPC/stash spots -> data/autumn/town-anchors.json
python scripts/lib/model_bounds.py <d2rpp.exe> <cache.json> <town presets...>
node scripts/build-autumn-town-props.mjs --bounds <cache.json>    # -> data/autumn/town-props.json
node scripts/build-autumn-overlay.mjs                             # -> data/autumn/overlay.zip
node scripts/verify-autumn.mjs --src D:/D2RModding/data/data
```

## Format rules learned the hard way (all verified in game)

- **Models** are Granny GR2 (64-bit LE, Oodle-compressed). d2rpp's OBJImport output
  does not render: it has no model/skeleton/bone binding, D2R material maps or
  VertexScale, and it uses 32-bit pointers. `scripts/lib/gr2patch.py` instead transplants the mesh into a
  vanilla single-mesh prop (sackpile01) in place. Quantise positions against the
  **template's** VertexScale: rewriting VertexScale has no effect in game
  (models rendered about 6.5 times too big). Stored UV V runs top-down.
- **New model paths** are untested for loading; the pumpkin and jack-o'-lantern use
  the unused vanilla test-model slots `hd/bvt/models/{blend,glass}_sphere`.
- **Texture overrides must keep vanilla width, height and mip count**. 512²
  recolours of 1024² foliage rendered as solid polygon blobs. `verify-autumn`
  checks this.
- `.texture`: `<DE(` header, format 62 = BC3 sRGB albedo, 61 = BC3 linear (normal maps
  DXT5nm, ORM), self-relative mip offsets (`scripts/lib/d2r-texture.mjs`).
- Placement: HD preset units = 2 × DS1 subtile. Obstacles come from real model
  geometry. Large concave meshes (forge, whole-town docks, fire ring) use
  steep-triangle occupancy cells, not bounding boxes. Jack-o'-lanterns at yaw 45°
  face the camera.
