# Archipelago: design notes

What was decided, what was measured, and what is still only believed. The full
exploratory history is on the branch `backup/archipelago-wip-2026-09-10`.

## Shape

| Part | Where | Job |
|---|---|---|
| Mod | `src/lib/randomizer/ap-mode.ts`, `POST /api/archipelago/mod` | A D2RR mod in which the multiworld is the only source of skill points, plus the tables that turn stats into things. |
| apworld | `apworld/d2rr/` | Items, locations, logic and options for Archipelago's generator. |
| Client | `tools/ap-client/` | Reads checks from the save and the running game; grants by changing stat values. |

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

## Believed, not yet run in the game

These are what `PLAYTEST.md` exists to settle.

- **A stat value written from outside is honoured by the game's logic.** Everything
  depends on it. The failed node experiment is consistent with writes landing on a
  display-only copy of the character; the earlier check that ruled this out looked only
  at the client-side unit table, where a server-side copy would not appear.
  `d2rr-ap probe -copies` finds other copies if this fails.
- **`keepzero` in itemstatcost.txt keeps an entry alive at zero.** Set on `newskills`,
  `statpts`, `gold` and the two custom stats. If it does not, points received while the
  pool is empty wait for the next level-up, or for a Draught.
- **Player spell 8 adds `calc` to `stat` permanently.** The vanilla Elixir row
  (`experience`, 5) is the only evidence. The Draught and the Receipt rely on it.
- **A cubemain `op` can test a custom player stat.** The data guide documents ops 7 to
  10 as comparisons on the player's base stat. Vanilla only uses op 28.
- **Emptying the life pool kills.** Unknown either way; the client checks and falls
  back.

## Decisions

- **Points, not skills.** Archipelago decides when a point arrives; the player chooses
  the skill and the game builds it. Consequently every class skill is level 1 with no
  prerequisites in an AP mod, and the tree for AP seed N is the tree the public spoiler
  shows for seed N.
- **Targets, not increments.** Unspent points, stat points and keys are recomputed from
  the item counts every poll, so duplicates, reordering and full resyncs converge.
  One-shot effects (gold, traps, runes) are owed until recorded as applied, and are
  recorded only after the write lands, because a repeat is the harmless direction.
- **Custom stats store value + 1** so they are never zero.
- **Keys gate recipes, not items.** Making a quest item is not possible from outside the
  game; refusing to combine the ones the player found is a one-line table change.
- **The mailbox.** One recipe is alive per offer; it takes the Sigil the player holds
  and returns the other, so it cannot fire twice. A Receipt whose use the client can see
  (stat + 1) is the acknowledgement. The client tracks which Sigil is held by counting
  deliveries. The state machine is `internal/grants/mail.go` and is tested exhaustively.
  `-mail-flip` corrects the client's idea of which Sigil is held, and `-mail-skip`
  records a rune whose Receipt was lost.
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
