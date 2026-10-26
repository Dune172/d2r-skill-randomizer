# Open Acts: handoff notes

For the next agent, on any PC. This branch is a work in progress: **nothing here is wired into the generator yet** (no route, ZIP or UI changes), so merging it changes nothing for players. The approved design is in [PLAN.md](PLAN.md). Everything below is what that plan doesn't say: what's been proven, what's pending, how to set up, and the rules the user gave.

## Goal
A generator option where **Acts I–III are open from the start** and the **key items that unlock act bosses are shuffled across all three acts**, like OOTR's dungeon order. Players work out which act to visit next.
- **Gates:**
  - Tristram needs the Key to the Cairn Stones (the Inifuss scroll, decoded by Akara).
  - Duriel needs the Horadric Staff (Cube + Staff of Kings + Viper amulet).
  - Mephisto needs Khalim's Will (Cube + Flail + Heart + Eye + Brain).
- **User's choices:**
  - The Cube is shuffled unless "start with cube" is on.
  - Key items can sit on quest objects *and* bosses.
  - Hints are **vague**: "somewhere in Act N" only.

## Rules from the user
- **Keep in-game testing to a minimum.** Prove everything you can offline. Batch the rest into one short session in the test-only arena mod, graded from memory by the watcher, not from screenshots.
- **Computer use is allowed but optional.** Ask for access when the user is at the PC; a prompt that arrives while they're away gets auto-denied.
  - The app name **"Diablo II Resurrected" resolves to the launcher**, not the game. Ask for **`D2R.exe`**, which only resolves while D2R is running: start it with `-mod ... -txt` first, then request access.
  - **Start it windowed** with `scripts/open-acts-spike/launch-d2r.ps1`. In exclusive fullscreen Windows reports no foreground window and the game ignores computer-use input. D2R keeps a `Settings.json` per mod save folder, so every new mod starts fullscreen; the script sets `"Window Mode": 0` there first.
  - In windowed mode the top ~130 px of the screen is the title bar: clicks there do nothing in game. Walk toward far targets in steps.
  - Only one session on the PC can hold computer control. If another holds it, ask the user rather than retrying.
- Commit, push or open PRs only when asked.

## Status
| Piece | State |
|---|---|
| Act tabs via data files | **Impossible** (proven in game, see below) |
| Starter save with act flags set (Normal) | **Works in game** (user tested 2026-09-29) |
| `src/lib/randomizer/open-acts/` (`pool`, `fill`, `starter-save`, `hints`) | Written. `scripts/verify-open-acts-fill.mjs` passes on 5000 seeds × 4 option combos. Not wired anywhere. |
| Arena test mod, test saves, memory watcher, grader | Built. Pipeline tested end to end, **session not yet played** |
| Watcher on D2R 3.3 (3.3.93847) | **Fixed 2026-10-26**, see below. Not yet committed |
| Launcher shortcut (L1) | **Blocked by Smart App Control** on a Windows 11 PC (2026-10-26): "blocked an app with a dangerous file extension". Decision gate L1 applies |
| Template characters (16: 8 classes × with/without Cube) | **Made 2026-10-26** in `data/starter-saves/` (built by `build-templates.mjs`); all 16 pass `patchStarterSave` |
| Generator wiring, ZIP, UI, changelog | **Built 2026-10-26** with toggles (see Next steps 4); verified offline and on generated ZIPs, not yet played |

### Next steps, in order
1. **Run the in-game session** (see "Testing" below). Grades S1, S2, D1–D3, H1–H4, R1–R4, Q1, L1, L2.
   - **In-town checks done 2026-10-26** (D2R 3.3.93847). The user wants in-game testing kept to simple checks inside towns, so nothing outside town was played.
     - S1 PASS: Spiketest loads at level 1 and its Normal waypoint panel shows tabs I–III.
     - S2: Nmtest in Nightmare ("Difficulty: Nightmare" on screen) shows tabs I–III, and waypoint travel to Lut Gholein and Kurast Docks works. The grader's monster-level half was not run (it needs leaving town).
     - Q1 PASS: after Akara gives Den of Evil, its quest-log text ends "HINT: Khalim's Eye is somewhere in Act I." Akara's shop opens and lists normally.
     - L1 FAIL: Smart App Control blocked the shortcut, so Lnktest was copied by hand (the grader's PASS only checks that the file exists). L2 PASS: Lnktest loads.
     - Arena run (played by the user, same day): **D1–D3 PASS** (Eye, Brain and Leg dropped on all 11 kills and were picked up), **H1 PASS** (Staff of Kings from an outdoor chest; later chests gave normal loot once it was held, as designed). H2–H4 and R1–R4 were not played; the user judged the mechanism proven and chose to skip them.
     - The arena mod triggers a "data version mismatch" prompt on launch (Continue works); it ships no `DataVersionBuild.txt`, unlike generated mods.
2. **Apply the decision gates in PLAN.md Phase 0:**
   - Boss drops fail (D1–D3) → set `bossLocations: false`. The fill already supports it, and Tristram stays as the gate.
   - Nightmare tabs fail (S2) → raise with the user.
   - Launcher flagged (L1) → no auto-copy; ship a README instead.
3. **Phase 1 (done 2026-10-26):** `scripts/open-acts-spike/build-templates.mjs` builds `d2rr_tpl` and `d2rr_tpl_cube` (vanilla data, `StartSkill` cleared; the Cube added as `applyHoradricCube` does). One level-1 character per class was made in each (Reign of the Warlock, softcore) and saved as `data/starter-saves/<class>[-cube].d2s`, lowercase class names (`amazon.d2s`, `amazon-cube.d2s`, …). All are v105, level 1, no skill points, valid checksums; each Cube save is 17 bytes larger. Character names in the templates are the class names; `patchStarterSave` replaces them.
   - Driving character creation with computer use: an always-on-top Claude panel covers the right third of the screen (where **Create New** sits) and is masked out of screenshots. Sliding the D2R window 460 px left with `SetWindowPos` uncovered it.
4. **Phase 2 wiring (built 2026-10-26, not yet played in game):**
   - **Options** (`open-acts/options.ts`, shared by the form, share links and both routes): `shuffle` (quest items), `bosses`, `hints`, `spoiler` (the last three only with the shuffle; default on) and `acts` = `[]`, `[2]` or `[2, 3]` (Act III requires Act II; the user chose II/III only, not IV/V). Share params `shuffleQuests=1`, `questBosses=0`, `questHints=0`, `questSpoiler=0`, `openActs=2,3`. Off = cache key and ZIP unchanged; on appends `:open-acts-v1:<flags>:a<acts>` after `makeCacheKey`. Disabled for challenges, Forgotten Arts and Class Builder mods.
   - **Closed acts:** `canReach` in `pool.ts` gives Act III locations the Duriel gate when Act III starts closed, so "shuffle only" works with any new character. `verify-open-acts-fill.mjs` covers 12 combinations.
   - **Generation:** `generate.ts` runs the shuffle after enemy shuffle (step 11c2) and `apply.ts` writes objects.txt handlers and boss TC wrappers (arena pattern, `Picks -2`, real TCs only). At ZIP time it builds quests.json (hints, or `neutralStrings` when hints are off), `quest-shuffle.json`, and the starter saves (all eight classes, or the race class; `-cube` templates with start-with-cube), patched with this seed's StartSkill slot and only the chosen acts' flags.
   - **Install:** no auto-copy launcher (Smart App Control blocked it). Saves ship in `<mod>/starter-saves/` with a README; the site's install steps show the folder (`<mod>[raceclass]_openacts`).
   - **UI:** an "Open Acts" section in `RandomizerForm.tsx` (checkboxes plus II/III pills); changelog v0.336.
   - **Checks:** `node scripts/verify-open-acts.mjs [url] [seed]` against a dev server (off vs three settings: only expected files change, monstats/superuniques only on boss rows, TC append-only, hints/spoiler/saves/savepath right). `verify-cached-download.mjs` now loads the real options module; its other failures (`withBuildSegment`, `getActiveMutations`, `isMutationActiveForWeek` mocks) predate this work.
   - **Generated seed in game (2026-10-26, in town only):** seed 20261026 (shuffle on, Acts II/III), installed as a player would. All 8 starters list and load with no data-version prompt; the Barbarian has 1 point in the seed's StartSkill (Ice Bolt, skill row 127, read from memory with `d2rr-ap probe`); the waypoint panel shows tabs I–III with Lut Gholein and Kurast Docks active; after Akara, the Den of Evil line shows the summary and every act matches `quest-shuffle.json`.
     - The first summary used line breaks and ran long: the quest log ignores `\n` (a blank line showed as `*`) and text past ~175 characters runs under the Play Quest Dialogue button. Hints are now single lines under `HINT_MAX_LENGTH` (175), checked by `verify-open-acts-fill.mjs`, and the fixed line was confirmed in game.
     - The ZIP cache is on disk and keyed by options, so a change to Open Acts output needs a new `:open-acts-vN` tag in `openActsCacheSegment` once v1 ZIPs exist in production (dev caches can be cleared by hand).
   - `/guide/install` has an "Open Acts: installing the starter characters" section. `npm run build` passes.
   - **Still to do:** play a generated seed past town (Tristram → Duriel → Mephisto) following the hints; H2–H4 were never played.

## Proven in game (D2R 3.x, save v105)
- **Data edits cannot open act tabs.** Spike variants A–C, 2026-09-29:
  - levels.txt `Waypoint=0` on a town marks it activated, but the Act II/III tabs stay hidden.
  - actinfo.txt entries display the *lowest-id level holding that waypoint index*. So a shared index 0 always shows "Rogue Encampment".
  - Giving Lut Gholein index 0 does let it be listed and warped to from the Act I tab, but its act and quest tabs stay locked.
- **Why:** tabs are gated on the `A1COMPLETED`/`A2COMPLETED` quest flags, which only Warriv and Meshif set, and only after the Andariel/Duriel rewards (D2MOO `Quests.cpp`, `SUnitNpc.cpp`).
- **A patched save works (variant D):** quest words 7 and 15 = `0x2001`, town waypoint bits 9 and 18, recomputed checksum. It loads, the Act II/III waypoint and quest-log tabs show, and Atma gives Radament.
  - Act III NPCs give nothing at first. That's vanilla: Act III quests start on entering areas.
  - After play, the game rewrites `0x2001` as `0x0001`.
- **Never tested in game:** objects.txt handler swaps, quest items from treasure classes, Nightmare tabs, the generated per-seed starter (`Spiketest`), the launcher shortcut. The arena session covers all of these.
- **From D2MOO** (all to be confirmed by the session):
  - Quest object handlers don't check act or level, and they re-drop when the player lacks the item.
  - The Inifuss handler (12) forces the OPERATING animation, and the Malus (objects.txt `Mode1=0`) has none.
  - The Viper altar (24) only completes Tainted Sun while the player is in Act II, so it stays fixed: Tainted Sun opens the Palace → Summoner → Canyon → Duriel.
  - Meshif's act change force-completes A2Q2 and deletes the Staff/Viper when `A2COMPLETED` is unset; pre-setting it avoids that.
  - Quest misc items have `spawnable=0`. Test D1 vs D2 tells whether that blocks TC drops.

## Save format (.d2s v105)
- **Header:**
  - magic `aa55aa55` at 0, version 105 at 4, file size at 8, checksum at 12
  - status at 20, **progression at 21** (5 = Normal finished, Nightmare selectable)
  - class at 24 (0 Ama, 1 Sor, 2 Nec, 3 Pal, 4 Bar, 5 Dru, 6 Asn, 7 War), level at 27, name at 299 (16 bytes, only stored there)
- **Checksum:** zero bytes 12..15, then `sum = rotl1(sum) + byte` over the file.
- **Quests:** `Woo!` at 403, a 10-byte header, then 3 difficulties × 48 uint16 words. Word 7 = Act I done, word 15 = Act II done.
- **Waypoints:** `WS` at 701, an 8-byte header, then 3 × 24 bytes, each starting `02 01`, then the bitfield (bit n → byte 2 + n/8). Bit 9 = Lut Gholein, bit 18 = Kurast Docks.
- **Skills:** the `if` marker after `gf`, then 30 bytes of hard points for the class's 30 skills.rows, in row order.
  - Class blocks start at rows 6/36/66/96/126/221/251/373 (ama sor nec pal bar dru ass war). Use `startSkillSlot()`.
- **Patching:** `patchStarterSave()` sets the act flags and town waypoints in **all three difficulties**, otherwise a Nightmare key could sit in a locked act. It leaves progression alone. It reproduces the in-game-tested `Spiketest` byte for byte, apart from those Nightmare/Hell additions.

## Design decisions made after PLAN.md
- **Two-step chain is built, not sampled.** With bosses on, the fill pre-places a staff part (Staff of Kings, or the Cube if shuffled) in Tristram and a Khalim organ on Duriel. Every seed then has an order: find the scroll → Tristram → Duriel → Mephisto.
  - Rejection sampling for depth 2 needed up to 432 tries; building it takes 1–7.
- **The Inifuss scroll is object-only.** Akara decodes it only if the handler set the quest step, so it never comes from a treasure class.
- **Fillers fill object slots only:** Malus, Lam Esen's Tome, Wirt's Leg.
  - A vacant chest host gets handler 4 (plain chest).
  - A vacant non-chest host gets a filler handler. A duplicate source is harmless.
- **Malus host whitelist:** handlers 21/39/41/57/58/59 only (from `Mode1=0` in objects.txt).
- **Hints replace vanilla lines** that name vanilla spots: `qstsa1q41`, `qstsa2q22`, `qstsa3q21`, `qstsa3q22`, `qstsa3q24`.
  - The Den of Evil line (`qstsa1q11`) also carries a summary of every key's act, because the Khalim quest appears late.
  - Every locale gets the English hint.
  - **Known gap:** spoken NPC lines still mention vanilla spots.
- **Sub-RNG** `createRNG(seed ^ 0x4F504E41)`, so existing seeds don't change.

## Testing
All tooling is in [`scripts/open-acts-spike/`](../../scripts/open-acts-spike/README.md); its README has the 5-minute session checklist.
- **Offline (any PC):** `node scripts/verify-open-acts-fill.mjs 5000`. It compiles the module with tsc into a temp dir and checks the shuffle, the patcher (against `scripts/open-acts-spike/saves/` fixtures) and the hints (against `data/local/strings/quests.json`).
- **Arena mod:** `node scripts/open-acts-spike/build-arena.mjs . data/local/strings/quests.json "C:/Program Files (x86)/Diablo II Resurrected/mods"`.
  - Monsters: 1 HP, no damage. Every kill drops Khalim's Eye, Khalim's Brain (made spawnable) and Wirt's Leg.
  - Stand-in hosts: outdoor chests → Staff of Kings; large chests (`Mode1=0`) → Heart; rogue corpses → Inifuss scroll.
  - Real hosts: Malus → Cube, tree → Lam Esen's Tome, Wirt's body → Horadric Scroll, Griswold → Flail.
  - The Den of Evil hint is included. Savepath is `d2rr_openacts_test`.
- **Test characters** (fixtures in `saves/`): copy `Spiketest`, `Nmtest` and `Arena` into `%USERPROFILE%\Saved Games\Diablo II Resurrected\mods\d2rr_openacts_test\`.
  - Put `Lnktest.d2s` in `<D2R>\mods\d2rr_openacts_arena\starter-saves\`, where the launcher installs it from.
  - Regenerate them with `make-nm-save.mjs` / `make-arena-save.mjs` from `ssssssssssss.d2s` (a played test Barbarian).
- **Launcher test:** `node scripts/open-acts-spike/make-test-lnk.mjs "<out>.lnk" d2rr_openacts_arena d2rr_openacts_test Lnktest`.
  - Zip the shortcut, then mark the zip as downloaded so SmartScreen and Defender treat it like a real download: `Set-Content <zip> -Stream Zone.Identifier -Value "[ZoneTransfer]``r``nZoneId=3"`. Extract it in Explorer.
- **Watcher:** `node scripts/open-acts-spike/build-observe.mjs` builds `bin/observe.exe`. It needs Go and pulls the vendored, patched d2go from `origin/claude/archipelago-branch-cleanup-34def9`.
  - `observe.exe` alone prints a snapshot. With `-watch log.jsonl` it logs events until D2R exits (attaching takes about 10 s).
  - `run-session.ps1` runs the watcher, then `check-arena.mjs`, and prints PASS/FAIL/NOT RUN per test.
  - d2go object ids equal objects.txt `*ID`. Item names are CamelCase (`KhalimsEye`).
  - **D2R 3.3 broke d2go** (2026-10-26): the watcher saw no character. Fixed by new patches in the Archipelago branch's `scripts/patch-d2go.mjs` (state offset, stash units, inventory panic, UI/waypoint offsets per build; details in that branch's `docs/archipelago/DESIGN_NOTES.md`) and by `observe/names.go`, which names items from `data/txt` because d2go's item table predates 3.3. `build-observe.mjs` prefers a local `../archipelago-branch-cleanup-34def9` worktree, so **the fixes only apply where that worktree has them** until they are committed and pushed.

## Setting up a PC
- **Required:** Windows, D2R at `C:\Program Files (x86)\Diablo II Resurrected` (the launcher and test scripts assume it), Node 22+, Go 1.22+, git, and `gh` (logged in for PRs).
- **Dependencies:** `npm ci` in the main checkout. Worktrees under `.claude/worktrees` have no `node_modules` and resolve the main checkout's.
  - On 2026-10-26 the shared install was stale (next 16.2.12, sharp 0.35.3, adm-zip 0.6.0 vs the lockfile's 16.3.8 / 0.35.5 / 0.6.1). Run `npm ls --depth=0` after pulling dependency changes.
  - **Never run `next build` in a worktree:** it once emptied the shared `node_modules/sharp`. Verify with `npx tsc --noEmit` and the dev server instead.
- **Dev server:** `.claude/launch.json` has `d2rr-dev` (`npm run dev`, port 3000). The `verify-*.mjs` scripts expect `localhost:3000`.
  - Manual `/api/randomize` test links need `&raceMode=0`, or seeds come out as Race Mode Prayer filler.
- **Game files:** `scripts/extract-casc.ps1` reads D2R's CASC storage through D2RMM's `CascLib.dll`. Its path is a parameter; the default is this user's D2RMM install.
  - Example: `-Files "data:data\local\lng\strings\quests.json" -OutRoot <dir>`. The vanilla `quests.json` is already committed under `data/local/strings/`.
