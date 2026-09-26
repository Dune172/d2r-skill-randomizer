# Forgotten Arts inventory artwork sources

Original, unmodified D2R assets copied from the local CASC extraction at
`D:/D2RModding/data/data`:

- `scroll.sprite`, `scroll.lowend.sprite`: `hd/global/ui/items/misc/scroll/identify_scroll.*`
- `book.sprite`, `book.lowend.sprite`: `hd/global/ui/items/misc/book/identify_book.*`
- `scroll.json`, `book.json`: matching unit definitions under `hd/items/misc/`.
- `globaldatahd.json`: `global/ui/layouts/globaldatahd.json` (native JSON with comments).

The generator copies the sprites unchanged to `forgotten_arts_scroll` and
`forgotten_arts_book` aliases, including numbered variants `1`, `2`, and `3`
for the charm graphics variation saved on items. It inserts alias-specific `colorRangeOverride`
and `colorTransformOverride` rules in `SpriteColoringHelper`, activated by
`uniqueitems.invtransform=lpur` and charm-base `InvTrans=8`. Base `uniqueinvfile`
is also set so the HD unique-art lookup is enabled, including shop clones.
This uses the game's native color renderer;
no generated or recolored bitmap replaces the original assets. Portal/identify
items retain their original aliases and color behavior.

The selective hue shift is intended to turn the red binding and red-brown cover purple while
retaining parchment and gold. It applies to HD inventory graphics (including
lowend sprites), not a recolored 3D ground texture. Legacy mode uses the
standard scroll/tome artwork with the native purple palette, so its color may
differ. Enabling the charm palette can also expose existing color affixes on
ordinary small/large charms within the mutation. Confirm the actual HD color in game; structural
tests cannot validate the engine's shader behavior.
