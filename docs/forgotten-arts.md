# Forgotten Arts — inventory spellbooks

Experimental Diablo I-inspired mutation. Challenge-only: featured in October
2026's monthly challenge, Return to Tristram, alongside the existing Molasses
and Entropy mutations. The standard generator does not offer it.

## Rules implemented

- Skills come from carried scroll/book charms and specific-spell equipment bonuses.
- Scrolls occupy one cell and grant +1 to a spell; books occupy two cells and
  grant +3. These are reusable oskills, not consumed or charged casts. Mana still
  pays for casting. Multiple copies are intended to add their bonuses together.
- Equipment can roll a specific catalogue spell: +1–2 at affix levels 1–34,
  +2–4 at 35–59, and +4–6 at 60+. All 35 spells have prefixes on magic/rare
  weapons, armor, rings and amulets. Later spells first enter at their original
  spell tier. These are oskills: they add to carried copies and also grant the
  spell while equipped, even without a matching charm. Gear retains its normal
  requirements; this does not change the no-requirement rule for spell charms.
- Charged suffixes cover the same catalogue. Native item-level scaling gives
  level 1–10 charges at item levels 1–40, levels 11–19 at 41–76, and level 20
  at 77+. This approximates Normal/Nightmare/Hell progression, not a strict
  difficulty restriction: boss item levels overlap and early Hell can be below 20.
  Charges stay at their rolled level when carried between difficulties; +skills
  does not increase the separate charged cast. New suffixes have up to 40 charges;
  unique items retain their original charge-count settings and scale spell level.
- Existing unique equipment class/tree/single-spell grants become catalogue
  oskills with the same three bonus ranges, using the unique's loot tier. Existing
  +All Skills and unrelated stats remain intact. Unsupported charged spells are
  replaced with catalogue spells. Obsolete class/charge affixes are disabled;
  their row IDs are preserved. Runewords and sets are unchanged in this release.
- All eight classes start with a Fire Bolt scroll and a Horadric Cube. Normal attack, throwing,
  identification and town portal utilities remain available.
- Skill trees are hidden, leveling awards no skill points, and point spending is
  blocked, including points awarded by quests. Quest reward notifications may
  still appear. Character stat progression is unchanged.
- The first catalogue contains 35 spells, each with a scroll and book variant.
  It covers elemental attacks, bone spells, curses and utility spells. It does
  not expose every D2 class skill; class-specific attacks, pets, forms and
  channeled skills are excluded from this first implementation.
- All scrolls and books have **no character-level requirement**. Their spells
  are usable from character level 1. Finding a powerful charm lets you use it
  immediately, including when passed to a new character. The engine adds six
  levels for a classless oskill, so every spell unique also grants hidden
  `levelreq=-7`. The mutation sets `item_levelreq` Save Add to 7 (seven bits
  unchanged) so the negative offset survives saving.
- **v7 requires a fresh character and newly generated items.** Earlier spell
  charms lack the saved offset, and pre-v7 upgraded equipment encoded its
  requirement penalty without the offset. Do not move old items into v7.
- Unique charm bases use `SkipName=1`: the spell title appears once without a
  Small/Large Charm subtitle. This also hides the base subtitle of other unique
  small/large charms; ordinary magic charm names remain unchanged.
- Drop progression is separate: `dropLevel` uses the original spell's tier,
  with books six tiers higher. Normal act pools admit tiers up to 6, 18, 24, 30
  and 36 respectively. The Normal Act I pool contains only +1 scrolls for Fire
  Bolt, Ice Bolt, Charged Bolt, Teeth, Bone Armor and Holy Bolt. The smaller pool
  encourages repeated finds. +3 books enter the ordinary drop pools from Act II;
  consolidation can make a +3 book earlier without creating extra skill levels.
  The unique item's `lvl` also keeps stronger charms out of low-level random
  unique rolls; its `lvl req` is always zero. Skill/description formulas use
  carried skill levels for synergies with other catalogue spells.
- Each spell has its original normal and pressed icon. HD, low-graphics and
  legacy sheets include the same catalogue, with existing utility icons intact.
- Spell items use Identify scroll/tome artwork with a purple inventory tint. Dedicated
  HD aliases and native `SpriteColoringHelper` rules target the red binding or red-brown
  cover; portal and identify item artwork is unchanged. Charm bases enable
  `InvTrans=8` and spell uniques select `lpur`. Legacy uses the native purple
  palette and can look different; 3D ground textures are not recolored. This
  also enables existing color affixes on ordinary small/large charms.
  The final tint still needs visual verification in game.
- v9 enables `misc.uniqueinvfile` for both spell charm bases and inherited shop
  bases. Each custom HD alias includes the unnumbered and `1`/`2`/`3` sprite
  paths (HD and lowend), with purple rules for each. This fixes missing lookup
  coverage for charm variants without removing ordinary charm variations.
  Existing v7/v8 items and characters can be retained; fully restart the game
  after replacing the mod files. The visual result still needs an in-game check.
- Books/scrolls receive half the weight of each act/difficulty's `Good` treasure
  pool. This is **not** a 50% chance per monster. Existing item entries and their
  relative weights are preserved. Normal unlocks higher spell tiers by act;
  Nightmare and Hell can roll the whole catalogue.
- Normal Act I progression estimates **13–17 charm-granted skill levels before equipment bonuses**, including
  the starting Fire Bolt scroll. Ordinary melee, caster, ranged and early quill
  beast tables now yield a scroll at **1/90 per kill** at base player settings,
  counting both the existing `Good` branch and a new direct scroll branch.
  The extra chance comes from `NoDrop`, preserving existing item probabilities.
  Wraiths already have a higher rate. The lower ordinary-monster rate leaves
  room for the shop and exploration rewards below.
- The Act I benchmark assumes **630–990 eligible ordinary kills** (810 at the
  midpoint), three named encounter rewards, one purchased level, one container
  level and the starter, for expected totals of 13–17 levels (15 at the midpoint). This is
  an explicit tuning assumption, not a measured first-clear route or a guaranteed
  range. Extra loot sources, farming, actual player settings and luck can raise
  or lower the result. Levels are spread across random spells, not freely
  allocated points. Playtest the first clear before tuning later-act budgets.
- Race Mode is disabled. Corpsefire drops Astral Wayfarer (required level 18,
  33 Teleport charges, no run-speed bonus) in all three difficulties. The
  original Bane Ash unique remains available.
  The save folder is `seed{seed}_forgotten_arts_v7`; create a new character there.

Removing a charm is intended to remove its granted levels. Stored charms in the
stash or Cube should not grant skills. Both behaviors need in-game confirmation.
This is inventory-based learning, not Diablo I's permanent book consumption.

## Consolidation and shopping

Place three matching items in the Cube and transmute:

| Inputs (all the same spell) | Output | Total levels |
| --- | --- | --- |
| Three +1 scrolls | One +3 book | 3 → 3 |
| Three +3 books | One +9 grimoire | 9 → 9 |
| Three +9 grimoires | One +27 codex | 27 → 27 |

Books, grimoires and codices occupy two inventory cells. The +9 and +27 forms
are craft-only; they do not enter random unique rolls or treasure pools.
The recipes match exact unique identities and reject different spells or
unrelated charms. Bought and looted scrolls can be mixed in any combination.
Consolidation stops at +27 per item; additional copies can still be carried.
All forms retain zero level requirement. Move the result back to the main
inventory to receive its skill levels. No permanent learning recipe is added.

Every potion vendor rolls a fresh assortment whenever their normal inventory
refreshes. Normal act progression expands the eligible pool:

| Act | Vendors | Eligible spells |
| --- | --- | --- |
| I | Akara | 6 starter spells |
| II | Lysander, Drognan | 18 spells, through native tier 12 |
| III | Alkor, Ormus | 26 spells, through native tier 18 |
| IV | Jamella | 30 spells, through native tier 24 |
| V | Malah | All 35 spells |

Nightmare/Hell shops use the full pool above character level 25. Stock has
three rolls below vendor item level 25 and three to five above that threshold.
Fire Bolt, Ice Bolt, Holy Bolt and Bone Armor have weight 8 each; Charged Bolt
and Teeth have weight 1 each. Other spells have weight 4, reduced to 2 for
tier 24/30 spells, Static Field, Corpse Explosion, Teleport and Blessed Hammer.
Duplicates are possible. Closing and reopening trade alone does not refresh.

Base prices are 7,500 for the four common starters; 12,500 for Charged Bolt,
Teeth and other tier 6 spells; 20,000 at tier 12; 30,000 at tier 18; 45,000 at
tier 24; and 60,000 at tier 30. Other tier 1 spells cost 7,500. Static Field,
Corpse Explosion, Teleport and Blessed Hammer cost 50% more, capped at 60,000.
Displayed prices retain native vendor and quest adjustments. Bought scrolls
resell for half their base price before vendor caps; dropped and crafted
items retain the separate 1,000 gold per skill level resale value.
Stock is finite: purchases remove copies until a normal vendor refresh. Refreshes are not
capped, so buying or farming repeatedly can exceed the Act I benchmark.
Stock supports both normal and higher-level magic-stock generation. No random
drop pool gets these shop bases.

## Exploration rewards

- Both normal bookshelf objects use regional chest loot instead of their
  hard-coded portal/identify-only drops. Their placement and artwork are kept.
- All fifteen late-area `Chest C` tables (five acts × three difficulties) have
  a **5% spell chance per pick**. A normal four-pick call yields 0.2 spell items
  on average, or roughly an 18.5% chance of at least one. Special chest routines
  can call the table more than once. This applies to all objects using those
  regional tables, including some outdoor containers; it is not dungeon-only.
- **Corpsefire in the Den of Evil and Bone Ash in the Cathedral** each drop
  one bonus early scroll on every Normal kill, followed by their original loot.
  These are repeatable encounter drops, not once-per-character quest rewards.
  Bone Ash's Nightmare/Hell and desecrated variants are unchanged.
- **Griswold in Tristram** grants one random early scroll in Normal, Nightmare
  and Hell, followed by his original loot. The six-spell pool stays low tier.
- Corpsefire additionally drops Astral Wayfarer in all three difficulties; the
  Normal wrapper retains the scroll and original loot within the six-item cap.
- The Den quest itself still awards its hard-coded skill point. A Corpsefire
  drop is an encounter reward, not an Akara quest hand-in.

The extra container chance comes from empty rolls. Existing item probabilities,
quest objects, Countess rune drops and normal chest A/B tables are preserved.

## Integration

The mutation is enabled only through the challenge calendar. Non-challenge
`/api/randomize`, `/api/download` and `/api/preview` requests ignore any
`forgottenArts` flag or `forgottenArts=1` URL parameter. The cache uses a separate mutation
suffix, and preview responses return no skill trees for this mode.
Each archive includes `forgotten-arts.json` with its spell catalogue, rules and
the prototype's limitations.

The mutation runs after the existing skill-row remap. Book `oskill` parameters
refer to final physical row indices, not the `*Id` comment column. Original
spell mechanics/descriptions are restored before removing class ownership;
tree-specific synergies and animations cannot leak into the book catalogue.
New TC definitions precede their consumers, including all nested pools.

Shared icon sources live in `data/sprites/global-skills`. The assembler preserves
the 40 HD utility frames and appends spell pairs at cels 40–109. Legacy preserves
its 24 original frames and pads the unused gap so both modes agree on `IconCel`.
The HD destinations come from `_profilehd.json`'s `SkillIconFilenames`:
`data/hd/global/ui/spells/submenu/skillicon.sprite` and its lowend variant.
Legacy uses `data/global/ui/spells/skillicon.dc6`. Normal generator output does
not include these replacements. The mutation cache suffix is `forgotten-arts-v23`.
The download manifest records the Act I target and kill-count assumptions.
The mutation also packages `cubemain.txt`, `objects.txt`, modified `misc.txt`
and `superuniques.txt`, plus HD item aliases for every spell item. Original Cube
recipes and asset mappings retain their order and content. The added source
tables/maps were copied from the local D2R CASC extraction at
`D:/D2RModding/data/data` (original game files are never edited).
Purple artwork sources are in `data/sprites/forgotten-arts-items/`. The sprites
are byte-identical copies; only per-alias native color rules are added to the
original `globaldatahd.json`. Other UI definitions and color rules are retained.

## Known limits before release

1. **In-game verification is pending.** Data/API/browser checks are not proof
   that the engine accepts every cast, refreshes skills on inventory changes,
   or renders custom unique book art correctly. Check all eight classes with
   mouse/keyboard and controller. Also verify Cube output (+3/+9/+27), mixed
   bought/looted inputs, Akara stock and displayed prices, shelf opening, and
   the bonus scroll plus original loot from both encounters.
2. **Runewords and sets are unchanged.** Specific-spell bonuses and stronger
   charges now deliberately appear on magic/rare and unique equipment.
   This repository does not include `runes.txt` or `setitems.txt`, so their
   original grants are outside this equipment pass. Staffmods remain disabled.
3. **Balance is provisional.** Confirm mana sustain, early spell availability,
   duplicate stacking beyond +3 on native classes, and spell damage through
   Nightmare/Hell. The level budget is an average first-clear model, not a cap.
4. Use a new character. This mutation does not erase hard points already stored
   in an existing save, and existing item instances retain their saved mods.

v8 retains the v7 save folder and encoding. Newly found or bought equipment gets
the new rolls; existing equipment keeps its saved properties.

## Verification

Run `node scripts/verify-forgotten-arts.mjs` and `npx tsc --noEmit`.
The mutation test uses the actual TypeScript module and shipped data, deliberately
moves skill rows, checks all 144 item grants and eight starters, checks backwards TC
references and loot reachability, and verifies unchanged monster/utility skills
and original loot entries. It also verifies every normal/pressed icon against
its source artwork in all three graphics formats, unchanged utility frames,
zero charm requirements, and progressively broader loot pools by act. The drop
graph check verifies the Act I per-kill rate and expected progression totals,
preserved ordinary item probabilities, and unchanged untargeted loot tables.
It checks 117 exact-match recipes for level conservation and rejected inputs,
mixed shop/loot copies, Cube access, stock eligibility, HD item aliases, shelf
edits and encounter wrappers.
Use `--preview` to also render `build/forgotten-arts-icons.png` for visual review.

Local API checks also generated and downloaded a seed, checked the packaged
tables/string names/save folder, verified cache separation, and generated a
normal seed afterward to check for cached-data contamination. Browser verification
checks shared-link restoration and the generator flow.

**Local server startup has external side effects:** `instrumentation.ts` starts
the Discord weekly announcer if its webhook is set. Test with
`DISCORD_WEEKLY_WEBHOOK_URL` explicitly set to an empty string before Next loads
`.env.local`, and use a temporary `STATE_DIR` and `ZIP_CACHE_DIR`.

## Engine references

- [Blizzard's charged-item suffix rules](https://classic.battle.net/diablo2exp/items/magic/chargedsuffixes.shtml)
  describe item-level scaling and charge use. The native dynamic branch used
  here is `ITEMMODS_PropertyFunc19` in
  [D2MOO ItemMods.cpp](https://github.com/ThePhrozenKeep/D2MOO/blob/master/source/D2Common/src/Items/ItemMods.cpp).
- [D2MOO item requirements and save encoding](https://github.com/ThePhrozenKeep/D2MOO/blob/master/source/D2Common/src/Items/Items.cpp)
  adds six to foreign/classless oskill requirements before `item_levelreq`,
  and saves stat values with `Save Add`. v7 checks the effective requirement
  after a modeled save/reload, not just the item's `lvl req` column.
- [Blizzard's oskill rules](https://classic.battle.net/diablo2exp/skills/basics.shtml)
  describe the native-class +3 cap that classless catalogue skills avoid.
- [Diablo II Data File Guide](https://d2r-gimli.github.io/diabloiidatafileguide/)
  documents class ownership, the global skill-icon sheet and skilldesc layout.
- [Treasure class data guide](https://d2r-tools.com/data/treasureclassex)
  describes backward TC references and weighted drop selection.
- [D2MOO Cube parser](https://github.com/ThePhrozenKeep/D2MOO/blob/master/source/D2Common/src/DataTbls/HoradricCube.cpp)
  resolves unique item names and quantity qualifiers in recipe inputs/outputs.
- [D2MOO item generation](https://github.com/ThePhrozenKeep/D2MOO/blob/master/source/D2Game/src/ITEMS/ItemMode.cpp)
  applies the base item's unique flag when assigning item quality.
- [D2MOO vendor cache](https://github.com/ThePhrozenKeep/D2MOO/blob/master/source/D2Game/src/UNIT/SUnitProxy.cpp)
  requires spawnable bases and vendor stock fields; normal and magic stock
  paths are in `SUnitNpc.cpp` beside it.
- [D2MOO object operations](https://github.com/ThePhrozenKeep/D2MOO/blob/master/source/D2Game/src/OBJECTS/ObjMode.cpp)
  documents bookshelf function 26, container function 14 and regional chest
  selection. These reconstructed legacy routines inform the implementation;
  current D2R behavior still needs in-game verification.

## Item fixes (v12)

Spell name IDs use the reserved 40000–40499 range, verified against the extracted
3.3 locale catalogue. The earlier max(item-names)+1 allocator collided with
other locale files and could display An Evil Force, including on crafted tomes.
All original unique row IDs and spell unique IDs are retained; the staff is
appended after them. Looted spell carriers now have base values of 2,000 for a +1
scroll and 6,000 for a +3 tome; +9 and +27 forms add the corresponding value.
At the native 50% vendor buy multiplier, resale is 1,000 / 3,000 / 9,000 /
27,000 gold before vendor caps. The free starter retains the engine's starting-item
price exception. Dedicated Akara shop scrolls keep the 7,500 purchase price and 3,750 resale
value before caps, including converted legacy purchases.
Vendor resale multipliers and act/difficulty sell caps still apply.

## Shop artwork correction (v13)

D2R accepts four-character codes in item tables but its HD items.json lookup
cannot display them. Shop stock now uses fs0–fs3 instead of fa00–fa03. The old
base rows and unique row IDs remain loadable. Cube an old invisible purchased
scroll by itself to convert it to the visible base with the same spell and +1
bonus, then combine normally. New purchases retain the confirmed names, level requirements and prices.
Stock is now finite as described below. No save file edits are needed.

Reference: https://us.forums.blizzard.com/en/d2r/t/list-of-simple-things-to-help-mods/34625

## Per-refresh shop assortment (v19)

The game rolls the spell when it creates each fs6 shop item. Six appended
unique variants share that base with weights 8/8/8/8/1/1. No assortment is
chosen at mod generation, including for October. All previous fs0–fs5 items
and unique IDs remain valid, with their old shop entries disabled. Cube recipes
accept all combinations of matching drops, old purchases and new purchases.
Stock remains finite at the existing 7,500 buy / 3,750 sell valuation. The
treasure-class file is unchanged, including the 1/90 Act I scroll rate and
equal spell weights in eligible drop pools.

## Potion vendor progression (v20)

The current shopping rules above supersede v19's Akara-only stock and flat
pricing. Act I retains fs6; acts II–V use f02–f05 with 109 appended unique
variants. All previous unique indices remain stable. Charged Bolt and Teeth
on fs6 now cost 12,500; retired fs0–fs5 purchases retain their old values.
Nightmare/Hell upgrade codes select f05 at runtime above character level 25.
Every combination of three matching dropped, old, or regional purchased
scrolls consolidates into the original tome. Drop tables remain unchanged.

## Item synergy descriptions (v21)

All spell scrolls, books, grimoires and codices have a cosmetic tooltip property
listing **Synergies:**. These lists are derived from
the original hard-point synergy formulas, restricted to the 35 available spells.
Unsupported synergies such as Bone Wall/Bone Prison are omitted; a spell with
no incoming supported synergies lists **None**.
The lists describe relationships, not a live damage calculation. Equipped spell
bonuses contribute to the same supported synergies as carried scroll levels.

Names and ground labels remain unchanged. Newly generated spell items receive
the property automatically. Put an existing spell item alone in the Cube and
transmute to recreate its exact variant with the description; its spell and
bonus remain the same. As with consolidation, recreation does not preserve the
free starter's special starting-item flag. Old invisible shop items first use
their existing conversion recipe and can then be refreshed if necessary.

The mutation appends 35 cosmetic stats (IDs 368–402), corresponding properties
to the original extracted properties.txt, and strings 40400–40434. Existing
stat/property/unique indices are preserved. Cosmetic stats add no item value or
gameplay effect. All 261 variants have a refresh recipe. Automated checks cover
relationships, bundled strings, recipes and unchanged gameplay properties;
v22 reverses the stored lines for the native bottom-to-top renderer, placing
**Synergies:** above the spell list, and removes the outgoing list.
Existing v21 tooltip properties use the corrected strings after restarting;
no additional Cube refresh is needed.
