# Winter Towns (seasonal HD overlay)

Every mod generated in December or January (America/Los_Angeles) includes
`data/winter/overlay.zip`, copied into the mod's `data/` folder. Like
[Autumn Towns](autumn-towns.md) it is purely visual and HD-only:

- snowmen (coal face, carrot nose, twig arms, striped scarf, top hat) standing
  in a mound of snow, piles of wrapped gifts and candle lanterns in all five
  towns, placed beside existing clutter near NPCs, the stash and camp props; no
  collision. Harrogath is decorated too; its ground and lighting stay vanilla.
- Act 1 outdoors (town, wilderness, Tristram): grass and moss ground becomes
  Act V snow with sparse dry Act V grass poking through, fewer weeds, snow
  clumps, frozen puddles and snow footsteps. Dirt paths and mud stay as
  trodden ground. Every texture and model used here is a vanilla Act V file,
  so the ground costs no download.
- frosted maple, hawthorn and witch hazel leaves and fallen-leaf decals, a
  gentle cool colour grade, cooler key light and paler fog.

Not included (by design): a snowman Cow King and falling snow.

Runtime is shared with autumn: `src/lib/seasons/season.ts` (Dec and Jan;
`D2RR_SEASON=winter` forces it for previews and tests) and
`src/lib/seasons/overlay.ts`. The cache tag is `:winter-<hash>`. It adds about
11 MB (compressed) per download, mostly the frosted foliage.

The same safeguards as autumn apply: the overlay is stamped with the
`DataVersionBuild` it was built for and a SHA-1 of every vanilla file it uses
(including the Act V snow textures and models it points at), is skipped with a
`[winter]` server warning after a game patch, and is checked by
`node scripts/verify-season.mjs --season winter [--src <extraction>]`.

**Before each December** (or after any D2R patch), re-extract the game files,
run `verify-season --season winter --src`, and if it fails, rebuild.

## Rebuilding the overlay (offline)

Same tools as autumn: a CASC extraction (default `D:/D2RModding/data/data`),
Python and `d2rpp.exe` from Bonesy's D2R MoPaH.

```
node scripts/build-winter-assets.mjs --d2rpp <d2rpp.exe>          # snowman/gifts/lantern models + textures + previews -> data/winter/assets
node scripts/build-winter-foliage.mjs                             # frosted leaves -> data/winter/foliage (gitignored)
python scripts/extract-town-anchors.py                            # NPC/stash spots -> data/seasons/town-anchors.json (shared)
python scripts/lib/model_bounds.py <d2rpp.exe> <cache.json> <town presets...>
node scripts/build-season-town-props.mjs --season winter --bounds <cache.json>  # -> data/winter/town-props.json
node scripts/build-winter-overlay.mjs                             # -> data/winter/overlay.zip
node scripts/verify-season.mjs --season winter --src D:/D2RModding/data/data
```

## Notes

- **Model slots:** snowman `hd/bvt/models/blend_sphere`, gifts `glass_sphere`
  (both also used by autumn; the seasons never ship together), lantern
  `detail_normal_sphere`.
- **Template limits:** meshes are transplanted into sackpile01, which allows
  coordinates up to ±3.52 units, 7164 vertices and 11532 triangles. The snowman
  is authored 2 units tall and placed at 1.6–2.0×.
- **Lantern flame:** the candle top sits at `LANTERN_FLAME_Y` (0.27 at scale 1,
  exported by `build-winter-assets.mjs`); the overlay puts the vanilla candle
  flame and light VFX there.
- **Grade:** the LUT is a global cool grade with slight desaturation. It must
  never be hue-selective (the autumn playtest showed that turns the poison
  tint yellow); the wintry colour comes from textures.
- **Snow ground:** Act 1 grass layers take the Albedo, Normal and ORM of
  `expansion_siege_snow01..03`, the dry grass atlas `expansion_siege_grass_atlas01`
  (6×1, as Act V uses it) and `snow_clump01/03` clutter. They keep their own
  noise and blend settings, so the tile-mask blending against paths is Act 1's.
