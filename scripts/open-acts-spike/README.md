# Open Acts spike: test method

Rule: keep in-game testing to a minimum. Everything that can be proven offline is (data diffs, save
checksums). What only the game can show runs in **one short session**. A memory watcher grades it, so
nobody has to read results off the screen. Claude drives the session with computer use when access to
`D2R.exe` is granted; otherwise you play it and the watcher still grades it.

## Pieces
| File | What it does |
|---|---|
| `build-arena.mjs` | Test-only mod `d2rr_openacts_arena`. Monsters have 1 HP, 0 defense, 0 damage and every kill drops Khalim's Eye, Brain and Wirt's Leg. Outdoor chests hold the Staff of Kings, large chests Khalim's Heart, rogue corpses the Inifuss scroll. Real hosts: Malus = Cube, Inifuss tree = Lam Esen's Tome, Wirt's body = Horadric Scroll, Griswold = Khalim's Flail. Den of Evil quest-log hint. |
| `make-arena-save.mjs` | `Arena` character: every Act I–III waypoint in Normal. |
| `make-nm-save.mjs` | `Nmtest`: Acts II/III open in all difficulties, Nightmare unlocked. |
| `make-test-lnk.mjs` | Launcher shortcut that copies missing starter saves, then starts D2R. |
| `observe/` + `build-observe.mjs` | Memory reader (d2go, from the Archipelago client). `observe.exe` prints a snapshot. `-watch <file>` logs events until D2R exits. |
| `check-arena.mjs` | Grades a watch log: PASS / FAIL / PARTIAL / NOT RUN per test. |
| `run-session.ps1` | Watch, then grade. Results land in `logs/`. |
| `saves/` | Fixtures. `ssssssssssss.d2s.bak` is a fresh test Barbarian; `ssssssssssss.d2s` is the same character after the variant-D play test. Built from them: `Spiketest`, `Nmtest`, `Arena`, `Lnktest`. |

Setting up on another PC: see [docs/open-acts/HANDOFF.md](../../docs/open-acts/HANDOFF.md#testing).

## The session (about 5 minutes)
1. `powershell -ExecutionPolicy Bypass -File scripts\open-acts-spike\run-session.ps1`
2. Extract `Downloads\d2rr_openacts_test_session.zip` in Explorer and double-click the shortcut. That's test L1, and it shows whether SmartScreen or Defender complains.
3. **Spiketest:** load, then save and exit (S1).
4. **Nmtest:** Nightmare. Click the waypoint, open the Act II and III tabs, then save and exit (S2).
5. **Lnktest:** load, then save and exit (L2).
6. **Arena:**
   - Open the quest log, then look at the Den of Evil hint (Q1).
   - Go to the Blood Moor. Kill a few monsters and pick up an Eye, a Brain and a Leg (D1–D3).
   - Open outdoor chests and large chests (H1/H2). Search a rogue corpse and take the scroll to Akara (H3/H4).
7. Optional: use waypoints to reach the Malus, the Inifuss tree and Tristram (R1–R4).
8. Quit D2R. The runner prints the grades.

## Facts the tools rely on
- d2go object ids equal objects.txt `*ID`.
- d2go item names are CamelCase (`KhalimsEye`, `ScrollOfInifuss`, `KeyToTheCairnStones`).
- Attaching takes about 10 s (offset scan), so start the watcher before loading a character.
- Monster level separates Normal from Nightmare: Act I monsters are 30+ in Nightmare.
