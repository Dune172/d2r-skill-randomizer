# Krampusnacht (December 2026): Krampus Is Coming and Cold Snap

Challenge 18 runs Dead Reckoning (13), **Krampus Is Coming (20)** and **Cold Snap
(21)**. Both new mutations are challenge-only (`CHALLENGE_ONLY` in
`src/lib/mutations/custom.ts`) until they have been through a challenge.

## Krampus Is Coming — `src/lib/randomizer/mutations/krampus.ts`

New spawn points would need map edits (superuniques are placed by level presets via
`hcIdx`), so Krampus takes over four existing, non-quest superuniques in place:

| Act | Replaces    | Area          | Drops (Normal / NM / Hell)     |
| --- | ----------- | ------------- | ------------------------------ |
| I   | Bishibosh   | Cold Plains   | Andariel (non-quest)           |
| II  | Beetleburst | Far Oasis     | Duriel - Base                  |
| III | Stormtree   | Lower Kurast  | Mephisto                       |
| V   | Frozenstein | Frozen River  | Baal                           |

Act IV has only quest and seal bosses, so it has no Krampus.

- **Monster rows.** `d2rr_krampus{act}` is a goatman (goatman1–10, nearest in level)
  rebalanced onto the replaced superunique's own monster with the enemy shuffle's
  `balanceEnemy`, so monlvl scales it to that spot. Life ×2, the replaced monster's
  experience, `minion1` = a matching balanced goat-man row (`d2rr_krampusgoat{act}`).
  `MonStatsEx` stays the donor's, as enemy-shuffle clones do.
- **Superunique.** Name `D2RR_Krampus` (string id 42000, added to the monster string
  table, `src/lib/krampus-assets.ts`), Mod1–3 = Cold Enchanted, Cursed, Extra Strong,
  the act boss's treasure class (Terror Zone columns too where vanilla fills them).
- **Look.** `hd/character/monsters.json` maps the Krampus rows to the `d2rr_krampus`
  unit, the goat-men to the goatman.

### The Krampus HD unit — `data/krampus/`, built by `scripts/build-krampus-assets.mjs`

`goatman1.json` under a new token, enlarged ×1.45 with a root
`TransformDefinitionComponent` (vanilla `act2hire.json` scales its root the same way),
carrying the Winter Towns gift stack on its back through a `UnitAttachmentComponent`
on `neck_bind_jnt`, like the Pumpkin King's head. Files shipped
(`krampusAssetFiles()`):

- `hd/character/enemy/d2rr_krampus.json` (+ an `npc/` copy)
- `hd/d2rr/krampus/krampus_gifts.json` (the attachment unit)
- `hd/bvt/models/skin_sphere_lod0.model` ← `data/winter/assets/gifts_lod0.model`, in an
  unused vanilla test slot (the seasons use blend/glass/detail_normal_sphere)
- `hd/d2rr/winter/gifts_alb.texture` (the model's material points here; identical to
  the Winter Towns copy, and the zip keeps one)

`manifest.json` stamps the `DataVersionBuild` and the SHA-1 of the `goatman1.json` it
copied. After a game patch the unit is skipped (`[krampus]` warning) and Krampus keeps
the plain goatman model until it is rebuilt:

```
powershell -File scripts/extract-casc.ps1 -CascDll <CascLib.dll> -OutRoot <dir> -Files "data:data\hd\character\enemy\goatman1.json"
node scripts/build-krampus-assets.mjs --src <dir>/data
```

### Seen in game (town NPCs mapped to the unit, 2026-11-14, D2R 3.4.95032)

- A new monster token loads. The folder follows the unit type: an NPC mapped to a
  token that existed only under `enemy/` was invisible, so the unit ships in both.
- The root scale works (the goat-demon stands well above a player).
- `neck_bind_jnt` exists on the goatman rig with identity rotation: body faces +z,
  y up, so −y/−z is below/behind the neck.
- Attachment scale is much smaller than level-placed props: scale 1 is a thumbnail,
  10 wider than the goat-demon. Final: translation (0, −1, −1), scale 4: the stack
  rides on his back with the horns above and boxes peeking out either side. At
  (0, −0.5, −0.5) scale 5 it sat on his shoulders and hid his head.

Not seen: Krampus himself (he lives outside town), his tint, his death nova, his
drops, and how the gifts follow attack and death animations.

## Cold Snap — `src/lib/randomizer/mutations/cold-snap.ts`

The frost nova on death has no data hook of its own; it is the hard-coded behaviour
of the `cold` monster modifier (monumod.txt row 18, Cold Enchanted), which also adds
cold damage. So:

- **Uniques**: cold's `upick` weights go to 10000 (others are ~6), so it is almost
  always a unique's first pick; later picks (Nightmare/Hell) stay random. `xfer` = 1,
  so their minions are Cold Enchanted too.
- **Champions** (experimental): cold becomes a champion type (`champion` = 1, `cpick`
  10000), so nearly every champion pack is a Cold Enchanted champion instead of
  champion/berserk/fanatic/possessed/ghostly. Vanilla never rolls a non-champion-type
  row for champions; not seen in play.
- **Superuniques**: cold goes into the first empty Mod slot, else replaces a disabled
  modifier, else the last slot (Ancient Kaa loses Lightning Enchanted).

**Cold pierce 10.** Every hostile monster gets monprop.txt property `pierce-cold`
(stat `passive_cold_pierce`, "−x% to enemy cold resistance") at 10, chance 100, in
every difficulty: monsters without a MonProp row get the new `d2rr_coldsnap` row,
monsters with one get it in a free slot of theirs. Player summons (skills.txt
`summon`) and mercenaries are left out. It applies after the 75% cap, shows nowhere
on the sheet and needs no reload. Vanilla already gives monsters attacker-side stats
from this family through monprop (the Council's `extra-fire`), but **a monster's
pierce against a player has not been seen in play**; it can only be checked by taking
cold damage outside town.

This replaced a first version, a −10 cold resistance passive (hidden starting skill,
`passive` = 1 on the unused `resistmagic` state). It showed −10% on the sheet in
game, but a brand-new character only got it from its first reload.

monumod.txt and monprop.txt are new in `data/txt/` (and `base/`), from
pinkufairy/D2R-Excel@7871977.

Checks: `node --test scripts/verify-custom-mutations.mjs` (December lineup against the
real tables), `node scripts/verify-monthly-challenges.mjs`.
