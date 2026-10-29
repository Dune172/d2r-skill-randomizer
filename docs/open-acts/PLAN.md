# Open Acts: key-item shuffle across Acts I–III (OOTR-style)

## Context
The goal is a generator option where Acts I–III are all open from minute one, and the items that unlock each act's boss (Duriel's chamber, the Durance of Hate, Tristram) are hidden around all three acts. Like dungeon order in OOTR, players have to work out which act to visit next.

**Review of the earlier work** (branch `claude/waypoint-unlocks-quest-shuffle-a0227f` has no commits; the spike scripts were in a deleted scratchpad; results are in memory `open-acts-spike.md` and the pasted transcript):
- **Proven in game:** data edits cannot open act tabs, because D2R gates them on the `A1COMPLETED`/`A2COMPLETED` quest flags that only Warriv and Meshif set. A patched `.d2s` with those flags (words 7 and 15 = `0x2001`) plus the town waypoint bits (9, 18) and a recomputed checksum **works**: it loads, the tabs and quest log show, and Atma gives Radament.
- **Never tested:** the generated per-seed starter (`D2RRandomizer/Spiketest.d2s` for mod `seed1234`) was built but never loaded. The objects.txt `OperateFn` swaps were never checked in game either.
- **Gaps in the old plan:**
  1. **Nightmare/Hell softlock.** The patch opened acts in Normal only, but objects.txt applies to every difficulty. In Nightmare, the Staff of Kings could sit in a still-locked Act III. Fix: set the flags and waypoints for all three difficulties.
  2. **No real "order" puzzle.** All 8 quest objects are in ungated areas, so every shuffle can be done in any order. Fix: add gated locations, namely Tristram (Wirt's body, Griswold) and first-kill boss drops (Duriel and others), and place items with logic.
  3. **The Viper altar can't move.** In D2MOO `A2Q3`, `SetPrimaryGoalDone` requires the player to be in Act II, and Tainted Sun completion is what opens the Palace → Summoner → Canyon → Duriel. It stays a fixed key, like the Council's Flail.
  4. **The Malus rule should come from data.** Hosts without an OPERATING mode (`objects.txt Mode1=0`, which is only the Malus) can't take the Inifuss handler (12) or any handler not proven safe without that mode.
  5. **Install friction.** Players had to copy saves by hand. The ZIP already ships a `.lnk` launcher (`src/lib/lnk-builder.ts`), so it can install the starter saves.
  6. **The start skill is randomized per seed** (`route.ts:605-619`), so starter saves must be built per seed from templates. The old plan already did this.

## Player experience
1. Download the seed. Double-click the launcher. It copies the starter character(s) into the mod's own save folder (never overwriting) and starts D2R.
2. Load the starter character. Lut Gholein and Kurast Docks waypoints are already active in all difficulties.
3. Andariel can be killed any time. Duriel needs the Horadric Staff (Cube + Staff of Kings + Viper amulet). Mephisto needs Khalim's Will (Cube + Flail + Heart + Eye + Brain). Tristram needs the Inifuss scroll decoded by Akara.
4. The quest log gives vague hints, e.g. "Khalim's Eye is somewhere in Act I." The full answer is `quest-shuffle.json` in the mod folder.

## Items and locations

**Key items** (placed by logic): Staff of Kings `msf` (41), Inifuss scroll `bks` (12), Khalim's Heart/Eye/Brain `qhr`/`qey`/`qbr` (57/58/59), plus the Horadric Cube `box` (39) **unless start-with-cube is on**. If it's on, the Cube comes in the starter save and is not in the pool.
**Filler items** (object slots only): Horadric Malus (21), Lam Esen's Tome (28), Wirt's Leg (33).
**Fixed keys** (vanilla): Viper amulet (Claw Viper altar), Khalim's Flail (Council), Radament's Horadric Scroll and Book of Skill.

**Locations**

| Kind | Location | Act | Gate |
|---|---|---|---|
| Object | Inifuss tree (Dark Wood), Malus (Barracks) | I | — |
| Object | Wirt's body (Tristram) | I | Key to the Cairn Stones (`bks` → Akara) |
| Object | Cube chest (Halls of the Dead), Staff chest (Maggot Lair) | II | — |
| Object | Lam Esen's tome, Heart/Eye/Brain chests | III | — |
| Boss | Blood Raven, Andariel | I | — |
| Boss | Griswold | I | Tristram |
| Boss | Radament, Summoner | II | — (Summoner via vanilla Palace; inputs fixed) |
| Boss | Duriel | II | Horadric Staff |
| Boss | Battlemaid Sarina, Icehawk Riftwing | III | — |

Goal: Mephisto reachable (Khalim's Will). Mephisto's own drop is not a location, because nothing in Acts I–III comes after him.

**Mechanisms**
- **Object slot:** set objects.txt `OperateFn` of the host row. This moves the item for real (handlers have no act check and re-drop if the player lacks the item). Vacant chest-type hosts get `4` (normal chest). Vacant non-chest hosts get a filler handler.
- **Boss slot:** add a guaranteed-drop wrapper TC around every TC column of that monster or superunique (all difficulties and Desecrated variants), so every kill drops it and a lost item can be farmed again. Generalize the `preserveLoot` wrapper in `applyBloodRavenQuestDrop` (`src/lib/randomizer/starting-items.ts:89-104`). Set `spawnable=1` on the placed code only if the spike shows it's needed, and confirm its item type isn't in any auto-generated TC group.
- **Host constraint:** a host with `Mode1=0` only takes handlers in a whitelist proven safe (chest handlers 39/41/57/58/59 and 21), never 12.

**Fill algorithm** (standard assumed fill):
- Shuffle the keys. Place each one into a random empty location that is reachable assuming all still-unplaced keys are owned and that meets the host rules.
- Then fill the remaining object slots with fillers, then leave the rest vacant.
- A forward sphere search verifies beatability and produces the playthrough order for the spoiler.
- Reject and retry (sub-RNG, up to N tries) unless the result is "interesting":
  - at least 4 keys outside their vanilla act;
  - at least 1 key behind a gate (Tristram or Duriel);
  - the two Act II staff keys don't both stay in Act II.
- Use a dedicated sub-RNG `createRNG(seed ^ 0x4F504E41)`, so the main pipeline's RNG and every existing seed are untouched.

**Vague hints:** rewrite the English (and copy to all locales) quest-log strings in `quests.json` for the quests that need each key: A1 Cain → Inifuss, A2 Horadric Staff → Cube and Staff of Kings, A3 Khalim's Will → Heart, Eye and Brain. Each says "somewhere in Act N". If Act III's quest appears too late to help (it starts on entering the Great Marsh), also put all hints in the Den of Evil text, which is visible from the start. `quests.json` is extracted once with `scripts/extract-casc.ps1` into `data/local/strings/`.

---

## Phase 0: in-game spike (gate for Phase 2)
**Testing rule:** keep in-game testing to a minimum.
- Run everything as one ~5-minute session in the test-only arena mod, graded from memory by `scripts/open-acts-spike/run-session.ps1` (the watcher plus `check-arena.mjs`; see that folder's README).
- Claude drives the session with computer use when `D2R.exe` access is granted. Otherwise the user plays it and the watcher grades it.
- The arena session replaces the manual checklist below. Its tests map to it: S1/S2 saves, D1–D3 boss drops, H1–H4 + R1–R4 hosts, Q1 hint, L1/L2 launcher.

Build it with a scratch builder (Holy Cow pattern): mod `d2rr_openacts_e` plus two patched saves. **User checklist:**
1. **Pending from last time:** load `Spiketest` in `seed1234`. Is it level 1, with only Mace Mastery at 1, and are the Act II/III tabs there?
2. **All-difficulty save:** a second save has the Nightmare/Hell act flags and waypoints set, plus the header progression byte unlocking Nightmare. Do the Nightmare Act II/III tabs show, with no crash?
3. **Boss drops:** Corpsefire drops Khalim's Eye (`qey`, a misc item) and Bishibosh drops the Staff of Kings (`msf`, a weapon). Are they picked up, do they count for their quest, and does it work again after a second kill?
4. **Object swaps** (from the old spike, never checked):
   - The Inifuss tree drops the Staff of Kings.
   - The Malus hosts handler 58 (Khalim's Eye) and doesn't freeze.
   - The Cube chest drops the Inifuss scroll, which Akara decodes and which opens the Cairn Stones.
5. **Hint:** a modded Den of Evil quest-log line shows the new text.
6. **Launcher:** a test `.lnk` running `cmd /c` copy-if-missing then `D2R.exe` installs the save and launches. **Check that Windows Defender/SmartScreen doesn't flag it** when it comes from a downloaded ZIP.

**Decision gate:**
- Step 3 fails → drop boss locations. Tristram stays as the only gate, and hints say so.
- Step 2 fails → Open Acts covers Normal only, with the shuffle limited so Nightmare and Hell can't lock (acts II/III items needed in act N come from acts ≤ N in NM/H); raise with the user first.
- Step 6 is flagged → no auto-copy; ship a README plus instructions instead.

Record the results in memory `open-acts-spike.md`.

## Phase 1: template characters (user, one sitting)
- Generate two template mods with vanilla data and `StartSkill` cleared: `d2rr_tpl` and `d2rr_tpl_cube` (Cube via the existing `applyHoradricCube`).
- The user makes one level-1 character per class in each, then quits. That's 16 characters.
- Commit them as `data/starter-saves/<class>.d2s` and `<class>-cube.d2s` (about 1 KB each).

## Phase 2: implementation
**Done offline (2026-10-26):** `pool.ts`, `fill.ts`, `starter-save.ts` and `hints.ts` in `src/lib/randomizer/open-acts/`, plus `scripts/verify-open-acts-fill.mjs`. All checks pass.
- **Changes from the design below:**
  - With bosses on, the fill builds a two-step chain up front (a staff part in Tristram, a Khalim organ on Duriel).
  - The hints replace the vanilla quest-log lines that name vanilla spots.
- **Still to do:** the TC/objects apply step, route/ZIP/UI wiring, templates.

**`src/lib/randomizer/open-acts/`** (new):
- `pool.ts`: the item/location/gate tables above (looked up by objects.txt `Class`, superuniques `Superunique`, monstats `Id`; throw if a row is missing).
- `fill.ts`: assumed fill, sphere search, the "interesting" rejection loop, and the manifest `{ item, location, act, kind, sphere }[]`.
- `apply.ts`: writes objects.txt `OperateFn`, the boss TC wrappers (reusing the generalized helper from `starting-items.ts`) and the hint strings.
- `starter-save.ts`: patches a template buffer. Steps:
  - Set the name and clear hotkeys and mouse skills.
  - Write the skills section from the mod's charstats `StartSkill`; the slot is the row index − class firstRow, with starts 6/36/66/96/126/221/251/373.
  - Set quest words 7/15 = `0x2001` × 3 difficulties and waypoint bits 9/18 × 3.
  - Fix the file size and checksum (`rotl1(sum)+byte` with the checksum field zeroed).
  - Assert the template's base stats match the mod's charstats, and fail generation if they don't. Offsets are in memory `open-acts-spike.md`; the Archipelago branch's `tools/ap-client/internal/save/save.go` is a cross-check.

**`src/app/api/randomize/route.ts`:**
- `openActs = !weekly && !forgottenArts && body.openActs === true`.
- Load objects.txt once and share it with Forgotten Arts (`route.ts:820`).
- Load superuniques, monstats and treasureclassex for the boss wrappers. Run after enemy shuffle so boss rows aren't overwritten.
- Savepath becomes `${modName}_openacts` (race: `${modName}${raceClass}_openacts`), so each seed's starters are isolated and the names can be fixed (`Amazon`, …).
- Race mode ships only the race class's save. Start-with-cube picks the `-cube` templates.

**Other files:**
- **`src/app/api/download/route.ts`** and **`src/lib/zip-cache.ts` `makeCacheKey`:** add an `openActs` param with the suffix `:open-acts-v1`. With the option off, keys are byte-identical, so no `PIPELINE_VERSION` bump.
- **`src/lib/zip-builder.ts`:** add `objectsTxt` (already supported), `superuniquesTxt`/`treasureclassexTxt`/`monstatsTxt` as needed, `quests.json`, `${mod}/starter-saves/*.d2s`, `${mod}/starter-saves/README.txt`, and `${mod}/quest-shuffle.json`.
- **`src/lib/lnk-builder.ts`:** when Open Acts is on, the target becomes `cmd.exe /c` with: mkdir the savepath, `if not exist` copy each starter, then start `D2R.exe -mod X -txt`. Stay within the arg-length limit.
- **UI:**
  - `src/components/RandomizerForm.tsx` and `src/app/components/RandomizerApp.tsx`: an "Open Acts" checkbox with a URL param, presets defaulting to false, and disabled with Forgotten Arts or weekly.
  - `InstallInstructions.tsx` and `src/app/guide/install/page.tsx`: a short starter-save section with the manual-copy fallback.
- **`src/lib/changelog/entries.ts`:** a player-facing entry for the next version.

## Verification
- **New script `scripts/verify-open-acts.mjs`** (dev server, `raceMode=0`):
  - For 200 seeds, every manifest is beatable by sphere search and meets the "interesting" rules.
  - The Malus never gets 12.
  - objects.txt and TC diffs touch only pool rows.
  - The same seed gives the same result.
  - With `openActs` off, the ZIP and skills.txt are byte-identical to before.
  - Starter saves: the checksum validates, the skills byte for StartSkill is 1, and the flags/waypoints are set in all 3 difficulties. Race mode ships 1 save; cube on picks the cube templates.
- `npx tsc --noEmit`, `npm run lint`, and the regression scripts `verify-skill-tab-strings.mjs` and `verify-controller-skills.mjs`.
- **In game (user):** play one generated seed using only the hints: reach Tristram, build the Staff, kill Duriel, build the Will, kill Mephisto. Then spot-check Nightmare Act II tabs with the all-difficulty test save.
