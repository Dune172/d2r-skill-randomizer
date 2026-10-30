# Archipelago: design notes

What was decided, what was measured, and what is still only believed.

## Shape

| Part | Where | Job |
|---|---|---|
| Mod | `src/lib/randomizer/ap-mode.ts`, `POST /api/archipelago/mod` | A D2RR mod in which the multiworld is the only source of skill points, plus the tables that turn stats into things. |
| apworld | `apworld/d2rr/` | Items, locations, logic and options for Archipelago's generator. |
| Client | `tools/ap-client/` | Reads checks from the save and the running game; grants by changing or adding stat entries; shows item messages in the game. |

The apworld generates offline and never talks to the client, so the two share fixed id
tables (`scripts/verify-ap-ids.mjs`). The mod tells the client about itself through a
manifest inside the zip.

## Measured (August to September 2026, live game)

- **The save file is read-only in practice.** D2R accepts an edited `.d2s` only when the
  game is fully closed, not mid-game and not at character select. So saves supply
  checks and can never deliver an item.
- **D2R section markers sit 68 bytes later than classic D2's.** `Woo!` at 403, `WS` at
  701. Every published layout is for classic and reads plausible garbage.
- **The stat list is sparse.** A character that has never held a skill point has no
  entry for one. Zero-valued stats are also not written to the save.
- **The assign-skill packet crashes D2R** (three attempts, including with a legitimate
  point). The packet ids available are for LoD 1.14, not D2R. No packets are sent.
- **A skill node built in memory does not work.** It renders, binds to a hotkey,
  animates and costs mana, and has no effect: no aura, no summon, a generic projectile
  instead of the attack. Linking one also crashes the game on exit unless unlinked.
- **Character level lives in the base stat list** (`+0x30`), not the list d2go calls
  `Stats`.
- **d2go's reading of the UI flag bytes is inverted** for the quit menu: byte `0x09`
  reads 1 in play and 0 with the menu open.
- **Three d2go bugs** are patched in `vendor/` (`scripts/patch-d2go.mjs` re-applies them
  after `go mod vendor`): a whole-module read that fails on any unreadable page, a
  pattern scan that runs past a short buffer, and the same read bug in the packet
  scanner.

## Direct delivery (2026-10-30, D2R 3.3.93847, in town only)

Testers found the potion flow (Draught, Tonic, Sigil, Receipt) unfun, so the client now
creates stat entries itself and the potions, the Sigil, the mailbox and runes are gone.
The 2026-10-29 results below are kept as a record of how the old flow was proven.

- **The client can add a stat entry the character does not have**, inside space the
  game already allocated. A unit's stat container holds a base list (container
  `+0x30`) and a combined list (container `+0xE8`), each an `{array, count, capacity}`
  header. Spending stat points checks the combined list, so the client writes both.
- **Measured** with a fresh Paladin in town (`probe -insert`): inserted 3 skill points
  and 2 stat points. The skill points were spendable at once and learned on the game's
  copy of the character. The stat points needed the combined list too; with it they
  were spendable at once. All of it survived Save and Exit.
- **Free slots are needed.** The arrays had 14 of 19 and 16 of 19 slots used on a fresh
  character. The client never allocates; see Known limits. With keys and pooled stat
  points on, the skill pool, the stat pool and the key stat fill the game copy's base
  list exactly (19 of 19), so the client:
  - checks every list a new entry needs, on both copies, before writing any of them, so
    a full list never leaves a stat half made;
  - writes the combined value equal to the base value, never moved by a difference, so
    a retry cannot add up (a first build did, and ran gold and skill points away in the
    combined list while the base list was full);
  - lets gold take a slot only if one stays free after it, so a skill pool the player
    spends to zero (which frees its slot) can always come back.
- **End to end, in town** (local Archipelago 0.6.7 room, apworld 0.3.0, a fresh Paladin,
  no potions): the starting skill point, sent skill points, stat points and a Horadric
  Key all arrived; stat points were spendable at once; a skill pool spent to zero came
  back when the next point arrived; "You found your ..." lines appeared bottom left and
  cleared after about 12 seconds.
- **In-game messages.** "You received X from Y" and "You sent X to Y" appear in a text
  box the mod adds to the chat layout, bottom left, in any display mode. The client
  writes the text and the game redraws it in place. Color codes are not interpreted in
  that box, so the text is white.

## Gate results (2026-10-29, D2R 3.3.93847, in town only)

Superseded on 2026-10-30 for everything about the Draught, the Tonic, the Sigil and
runes (see above). G1 and the key gates still describe the current design.

Mod: seed 987002, Paladin, keys on. Characters: a fresh Paladin, and a level 2
Barbarian save with one unspent skill point (the only way to get a `newskills` entry
without leaving town).

- **G1, a written skill point: honoured only if both copies are written.** There are
  two copies of the player unit. `probe` writes the one the client reads. Written alone,
  the tree shows the new total and lets you click it down to zero, but only the point
  the character really had is learned (3 shown, 1 learned), and the save agrees. With
  `probe -unit <copy> -set 5=3` as well, all three are learned on both copies, are in
  the save, and are still there after Save and Exit and re-entering. So the client has
  to write both copies. `probe -copies` takes over two minutes, so finding the second
  copy needs a faster route than the memory scan.
- **`keepzero` does not keep a base stat at zero.** `newskills` had `keepzero` set and
  the entry still disappeared from both copies when the last point was spent. Once the
  pool is empty, the client has nothing to write until a level-up or quest creates the
  entry again. (Since 2026-10-30 the client re-creates the entry itself.)
- **G2 fails: player spell 8 ignores the stat columns.** The Draught of Attunement
  (spell 8, `stat1..3` = `ap_keys`, `ap_mail`, `newskills`) was used up and gave +1 to a
  random attribute (Dexterity the first time, Vitality the second), the same as an
  unmodded Elixir would. None of 5, 368 or 369 was created. The Receipt uses the same
  spell, so it cannot acknowledge a delivery either.
- **G3, partly: a cubemain `op` does test a custom player stat.** With 369 absent (0),
  the Sigil alone produced a Draught and the Sigil back: the brew recipe (op 8, 369 ≤ 1)
  fired and the El Rune recipe listed before it (op 10, 369 = 2) did not. The rest of
  G3 needs a 369 entry, which nothing can create yet (see G2).
- **G2 and G3 pass with player spell 4** (same day, gate mod hand-patched from spell 8 to
  4 on the Draught and the Receipt). The Draught created 5 = 1, 368 = 1 and 369 = 256 on
  both copies and changed no attribute. With 369 = 2 the Sigil gave an El Rune, the other
  Sigil and a Receipt. The Receipt took 369 to 3. The other Sigil then did nothing at 3
  and delivered at 4. Everything survived Save and Exit. Spell 4 adds an item's stat
  columns to base stats permanently when `len` is empty (D2MOO `SkillItem.cpp`); the
  other spells don't. See `KEYS_AND_RUNES.md`.
- **G6 passes: the Tonic brings back an empty pool** (same day, on a mod generated from
  the branch with pooled stats). With the last skill point spent, stat 5 was gone from
  both copies. A Tonic brewed from the idle Sigil restored `5=1` and `4=1` on both. The
  point it gave was spent, and the skill stayed learned after Save and Exit.
- **The Tonic is brewed only on request, and the key gates hold** (same day, a mod
  generated with the request in place, fresh character). With 369 absent the Sigil
  brewed a Draught; drunk, it set 5, 368 and 369 on both copies. At 369 = 256 and at
  idle (1) the Sigil brewed nothing; at the request value (200) it brewed the Tonic,
  which brought back 5 and 4. The real Khalim's Will recipe refused at 0 and 4 keys and
  made the item at 5; the real Horadric Staff refused at 1 key and made it at 2. Making
  both on a control mod with vanilla `op 28` left identical quest and waypoint bytes in
  the save, so the key gate's op 7 changes nothing the game records.
- **Not run:** G1 step 4 (do learned skills work in combat), G4 (traps, DeathLink) and
  G5 (a real room), which need leaving town. The client running a local room against the
  game has been run in town; see KEYS_AND_RUNES.md.
- **Cosmetic:** the Sigil shows as "Burning Dead Archipelago Sigil". The `hrt` monster
  part prefixes the monster's name.

## Believed, not yet run in the game

- **Learned skills work in combat.** The skills above were learned by the game's own
  code, unlike the earlier nodes built in memory, so this is likely; G1 step 4 settles it.
- **Emptying the life pool kills.** Unknown either way; the client checks and falls
  back.

## Decisions

- **Points, not skills.** Archipelago decides when a point arrives; the player chooses
  the skill and the game builds it. Consequently every class skill is level 1 with no
  prerequisites in an AP mod, and the tree for AP seed N is the tree the public spoiler
  shows for seed N.
- **Targets, not increments.** Unspent points, stat points and keys are recomputed from
  the item counts every poll, so duplicates, reordering and full resyncs converge.
  One-shot effects (gold, traps) are owed until recorded as applied, and are
  recorded only after the write lands, because a repeat is the harmless direction.
- **Every write goes to both copies of the character.** `SetPlayerStat` writes the
  game's own copy first, then the display copy. The game's copy is found by scanning
  heap memory nearest the player first (it sat 60 to 130 KB away in every measurement),
  is cached per player unit, and must be the only candidate; `probe -copies` still does
  the full scan.
- **Custom stats store value + 1** so they are never zero.
- **The client creates missing stat entries itself** (since 2026-10-30). When the
  character has no entry for unspent skill points, stat points or the key count, the
  client adds one to the game's own stat array, in a free slot the game already
  allocated, in both the base and the combined list and on both copies of the
  character. This replaced the Draught of Attunement, the Tonic of Renewal and the
  Archipelago Sigil, so a player has nothing to drink or transmute, and points sent
  while the pool is empty simply arrive.
- **Keys gate recipes, not items.** Making a quest item is not possible from outside the
  game; refusing to combine the ones the player found is a one-line table change.
- **No runes for now** (2026-10-30). Delivering an item needed the Sigil mailbox, which
  went with the potions. The rune item names and ids stay reserved in the id tables and
  are never placed, so ids do not move if runes come back.
- **Item messages in the game.** The mod adds a text box to the chat layout; the client
  writes "You received X from Y" / "You sent X to Y" into it, and the game redraws the
  text in place. Color codes are not interpreted there, so the text is plain white. The
  client's own window shows the same lines.
- **No seasonal overlay in AP mods**, and the zip is cached on disk only: a room's mod
  must not change with the month, and one-off 47 MB zips must not evict public seeds.
- **The room decides which locations exist.** The client sends a check only if the
  server listed that location for the slot, which covers short goals and disabled check
  groups without the client re-deriving them.
- **No Monster Shrine trap.** It needs the game's own code to run. Traps are stat writes.
- **Only areas a run passes through are checks.** The cow level (open only after Baal),
  the Pandemonium event and the Colossal Summit are left out: an item placed there would
  be stranded. Areas are named as the game shows them, not as `levels.txt` does.

## Known limits

- Horadric Keys and pooled stat points are experimental: checked in town, but no full
  run has been played with them.
- An entry can only be added when the game's stat array has a free slot (measured 14
  and 16 of 19 used on a fresh character). When it is full, the client waits for the
  game to grow it, which happens the next time the game adds a stat of its own (a
  level-up, a quest reward, an item), and delivers then.
- Items arrive only while the client is running; nothing in the game can collect them
  without it.
- Level-up and quest points can be spent in the fraction of a second before the client
  takes them back, and freely if the client is not running. It is a single-player game;
  this is accounting, not enforcement.
- Area checks on Nightmare and Hell need `-difficulty`, or a calibration recorded with
  `doctor -calibrate-difficulty`. No field has been found that states the difficulty.
- A `PIPELINE_VERSION` bump changes AP mods as well. A client keeps the mod it
  installed; regenerating mid-run is not supported.
- Offsets come from pattern scans in vendored d2go, last updated October 2025, with no
  maintained upstream. A D2R patch can break them; `d2rr-ap doctor` and `probe` are the
  first things to run after one.

## After a D2R patch

1. `d2rr-ap saves <save folder>`: do quests and waypoints still parse?
2. `d2rr-ap probe` in a game: are the player's stats and skills readable?
3. G1 from `PLAYTEST.md`.
4. `d2rr-ap doctor -manifest <zip> -calibrate-difficulty -difficulty 0` from a Normal
   game, to re-record the difficulty profile for the new executable.
5. Re-measure the module offsets in `knownBuildOffsets` (`scripts/patch-d2go.mjs`).

### D2R 3.3 (build 3.3.93847, measured 2026-10-26)

- **Code pages are readable only while in use.** A pattern that matched a minute ago
  can miss now, and most of d2go's 16 patterns miss at attach. The UI block and the
  waypoint list therefore fall back to offsets measured per build, keyed by the PE
  header's TimeDateStamp (`0x6a6b96a4` here): UI `0x1EBD162`, waypoints `0x1D5F470`.
  `GameReader.GetData` rescans every 2 s while either is unresolved and never discards
  one it already has.
- **States moved** from statsListEx `+0xAF0` to `+0xB30` (a second copy at `+0xB50`).
- **Seven player units** in an offline game: the character plus six shared-stash
  pseudo-players. The expansion-flag pattern no longer resolves, so all seven passed
  the main-player test; the stash ones are now dropped by their Sharedstash state.
- **d2go's item table predates 3.3**, so classIDs after the first inserted item name
  the wrong item (a Town Portal scroll reads as `TheBlackTowerKey`). Map classID to
  code from the repo's `data/txt` (weapons, armor, misc, skipping `Expansion` rows).
- **How the offsets were found** (`go run ./cmd/obsdebug snap|diff|wp|pat` in
  `tools/ap-client`): with a character loaded, snapshot the D2R.exe module
  image, toggle one panel, snapshot again, and keep bytes that flip 0 -> 1 -> 0. The
  inventory flag is `uiBase+0x01` and the character panel `uiBase+0x02`; one address
  satisfied both. For the waypoint list, open the panel and search for the Act I area
  ids `1, 3, 4, 5, 6, 27, 29, 32, 35` at an 8-byte stride.
- Still unresolved on 3.3 and unused by the client: GameData, Expansion, Roster,
  PanelManager, WidgetStates, KeyBindings, TZ, Ping, and the quest bytes (read as zeros).
