# Archipelago: in-game gates

Everything that can be checked without the game has been: the mod's tables, real
multiworld generation, and the client against a real Archipelago server. What has
**never** been checked is the one thing all of it rests on:

> When the client changes a value in the running game, does the game's own logic
> honour it, or only display it?

The earlier design (building skill nodes in memory) produced skills that rendered,
animated and cost mana, and did nothing. That is exactly what a write to a display-only
copy of the character looks like, so nothing here should be assumed to work until the
gates below have been run. Each takes a few minutes. They are ordered so that a failure
stops you early.

Offline only. The client refuses to act while the game is on Battle.net.

## Already set up on this machine

| | |
|---|---|
| Test mod | `C:\Program Files (x86)\Diablo II Resurrected\mods\seed987002` (Paladin, Horadric Keys on) |
| Its save folder | `%USERPROFILE%\Saved Games\Diablo II Resurrected\mods\ap_gate_pal` |
| Test character | `gfv`, a copy of your level 2 Paladin: 1 unspent skill point, 5 stat points. The original in `D2RRandomizer` is untouched. |
| Client | `dist\d2rr-ap.exe` in this worktree |

Start the game with the mod:

```powershell
& "C:\Program Files (x86)\Diablo II Resurrected\D2R.exe" -mod seed987002 -txt
```

Run the client commands from the worktree root. If a command reports
`OpenProcess: Access is denied`, use an Administrator terminal.

The stat ids used below: 4 stat points, 5 skill points, 6 life, 8 mana, 10 stamina,
14 gold, 368 Horadric Keys (count + 1), 369 mailbox.

## G1: is a written value honoured?

Load `gfv` (Offline) and stand in town.

```powershell
dist\d2rr-ap.exe probe
dist\d2rr-ap.exe probe -set 5=3 -set 4=10
```

1. The skill tree shows 3 points and the character sheet 10. *(If not, the write did
   not even reach the display: stop, send me the two outputs.)*
2. Spend the 3 skill points one each on an attack, a summon and an aura, the three
   kinds that failed before. In this mod's Paladin tree:
   **Holy Bolt** (first tab, row 2, left), **Clay Golem** (third tab, row 2, right) and
   **Cleansing** (third tab, row 3, right). Spend the 10 stat points too.
3. Leave town. **Holy Bolt must fire a bolt and hurt a monster** (not a generic swing),
   **the golem must appear and fight**, and **Cleansing must switch on as an aura**.
4. `dist\d2rr-ap.exe probe` again. Expect `"skillLevels"` to contain `"100":1`,
   `"105":1` and `"107":1`, and note whether stats 4 and 5 are still listed, now at 0.
   That tells us if `keepzero` works.
5. Save and Exit, re-enter. The three skills and the attributes must still be there.

**Pass:** steps 2, 3 and 5 all hold. Skill points and pooled stat points are sound.

**Fail** (points show but will not spend, or spend and do nothing, or vanish on re-entry):

```powershell
dist\d2rr-ap.exe probe -copies
```

This lists other copies of the character in the game's memory. For each `unit` it
prints, repeat the test against it: `probe -unit 0x... -set 5=3`. If one of them makes
the points real, the fix is small (write that copy). If none does, the approach of
writing from outside the game does not work, and nothing below is worth running.

## G2: can the mod create a stat for the client to write?

Create a **new** Paladin in this mod. It starts with an Archipelago Sigil, a Draught of
Attunement and a Horadric Cube.

```powershell
dist\d2rr-ap.exe probe
```

Stats 5, 368 and 369 should be absent. Right-click the **Draught of Attunement**, then
probe again.

**Pass:** 368 is 1, 369 is 256, 5 is 1. Save and Exit, re-enter, probe: 368 and 369
are still there.

**Fail:** the Draught does nothing, or the stats are gone after re-entering. Keys and
runes then need another way to create the stat (a starter save is the fallback).

## G3: does a Cube recipe obey a stat?

Same character, in town, Cube open.

1. `dist\d2rr-ap.exe probe -set 369=1` to set the mailbox idle (the running client does
   this by itself; the Draught leaves it at 256). Put the **Sigil alone** in the Cube
   and transmute. Expect a second Draught and the Sigil back.
2. `dist\d2rr-ap.exe probe -set 369=2`, transmute the Sigil alone. Expect an **El Rune**,
   a Sigil and an **Archipelago Receipt**.
3. Transmute the Sigil alone **again** without touching the Receipt. Expect **nothing**:
   the Cube should refuse. *(If it gives a second El Rune, tell me: the exactly-once
   guarantee depends on this.)*
4. Right-click the Receipt, then probe. Stat 369 should read 3.
5. `dist\d2rr-ap.exe probe -set 369=8`, transmute. Expect an **Eld Rune** (offer 8 is
   the Eld for the second Sigil, which is the one you now hold).

**Pass:** all five. Runes work, and so do key gates, which use the same mechanism: the
Horadric Staff recipe needs stat 368 at 3 or more, Khalim's Will at 6 or more.

## G4: traps and DeathLink

Any character, outside town, mana and stamina partly full.

```powershell
dist\d2rr-ap.exe probe -set 8=0 -set 10=0
dist\d2rr-ap.exe probe -set 6=256
dist\d2rr-ap.exe probe -set 6=0
```

**Pass for traps:** mana and stamina empty at once and behave as empty (no casting, no
running); life drops to 1 and the next hit kills.

**DeathLink:** after `6=0`, does the character die? Either answer is fine. The client
checks for itself and falls back to leaving you on one life if the game ignores it;
I only need to know which, to describe it correctly.

## G5: a real room

Only after G1 passes. In the Archipelago Launcher, generate with a YAML from
`/archipelago` (goal Andariel on Normal is enough; turn on whatever passed above), host
it, then with the game closed:

```powershell
dist\d2rr-ap.exe -host localhost -port <port> -slot <name> -base-url http://localhost:3000 -launch
```

`-base-url` points at a local `npm run dev` until the endpoint is deployed. Create a new
character of your class and play to the goal. What to watch:

- Points arrive and match the client's log. Skills bought with them work.
- Checks reach the room as you complete quests, take waypoints, enter areas and level.
- Save and Exit, restart the client: nothing is granted twice.
- Level up: the point the game hands you is taken back within a second.
- Kill the goal boss: the client prints `GOAL COMPLETE`.
- From the server console, `/send <name> El Rune`, `/send <name> Mana Burn Trap`,
  `/send <name> Progressive Horadric Key` for anything you enabled.

## What to send back

For any gate that fails: the `probe` output before and after, and what you saw in the
game. For gates that pass, a word is enough, and I will switch the matching option from
experimental to supported.

## The automated checks

```powershell
npm run ap:test                       # tables, id and option cross-checks, client unit tests
node scripts/dev-cold-cache.mjs       # a dev server on :3210 with throwaway state, for the next three
node scripts/verify-ap-mode.mjs       # the mod's tables, 8 classes and option mixes
node scripts/build-apworld.mjs --install
node scripts/verify-apworld-fill.mjs  # 74 real multiworlds, each audited from its spoiler
node scripts/verify-ap-room.mjs       # the client against a real hosted room
```
