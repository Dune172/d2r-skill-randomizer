# Archipelago: in-game gates

Everything that can be checked without the game is checked by CI: the mod's tables,
real multiworld generation, and the client against a real Archipelago server. What only
the game can answer is the question all of it rests on:

> When the client changes a value in the running game, does the game's own logic
> honour it, or only display it?

An earlier design (building skill nodes in memory) produced skills that rendered,
animated and cost mana, and did nothing. That is what a write to a display-only copy of
the character looks like, so treat nothing here as working until its gate has passed on
the D2R build you have. Run the gates after every D2R patch, in order: a failure stops
you early.

Each step is marked **in town** or **outside town**. The in-town steps are quick and
safe; the outside-town ones need a character that can fight.

Offline only. The client refuses to act while the game is on Battle.net.

## Results so far

From `DESIGN_NOTES.md` (D2R 3.3.93847, 2026-10-29, in town only):

| Gate | Result |
|---|---|
| G1 skill points | **Pass in town**, once both copies of the player are written. `probe -set` and the client now do that. Combat (step 4) not run. |
| G2 creating a stat | **Fails.** The Draught of Attunement does not create the stats. Cannot pass until keys and runes get a new mechanism. |
| G3 Cube recipes | **Half.** A recipe does test the mail stat (step 1 passes). The rune half needs a mail stat entry, which nothing can create yet (see G2). |
| G4 traps, DeathLink | Not run (outside town). |
| G5 a real room | Not run (outside town). |

Keys, pooled stat points and runes are marked "not working" in the options for this
reason. Skill points, checks, gold, traps and DeathLink do not depend on G2.

## Setup

You need a D2R install, Node 22 and Go (see `tools/ap-client/go.mod`), on Windows.
The commands below are PowerShell, run from the repository root.

### 1. Build the client

```powershell
go build -C tools/ap-client -o ..\..\dist\d2rr-ap.exe ./cmd/d2rr-ap
```

`dist\` is ignored by git. If a command later reports `OpenProcess: Access is denied`,
use an Administrator terminal.

### 2. Make a test mod

Start a dev server with throwaway state (every request is a fresh build, and nothing
touches the real counters or caches):

```powershell
npm ci
node scripts/dev-cold-cache.mjs          # http://localhost:3210; leave it running
```

In a second terminal, ask it for an Archipelago mod. Pick any seed, a class, and a save
folder name (letters, digits, `-`, `_`); the save folder keeps the test character apart
from your real ones. `keyItems` turns on the Horadric Key recipes that G3 looks at.

```powershell
$body = @{ seed = 987002; contractVersion = 3; characterClass = 'pal';
           savepath = 'ap_gate_pal'; options = @{ keyItems = $true } } | ConvertTo-Json
Invoke-WebRequest -Method Post -Uri http://localhost:3210/api/archipelago/mod `
  -ContentType application/json -Body $body -OutFile dist\ap_gate.zip
```

The first build takes a minute or two. The zip holds one folder, `seed<seed>` (here
`seed987002`). Extract it into D2R's `mods` folder, with D2R closed (an Administrator
terminal if D2R is under Program Files):

```powershell
$d2r = 'C:\Program Files (x86)\Diablo II Resurrected'   # your D2R folder
Expand-Archive dist\ap_gate.zip -DestinationPath "$d2r\mods"
```

Start the game with the mod:

```powershell
& "$d2r\D2R.exe" -mod seed987002 -txt
```

The mod saves to `Saved Games\Diablo II Resurrected\mods\ap_gate_pal` (wherever
Windows keeps your Saved Games folder).

### 3. Make the characters

- **A fresh character** (in town): create a new character of the mod's class. It
  starts with an Archipelago Sigil, a Draught of Attunement and a Horadric Cube. G2 and
  G3 use it.
- **A character with an unspent skill point.** G1 needs the skill-point stat to exist,
  and the game creates it only when the character gets a point. Either:
  - *in town:* with D2R closed, copy a level 2 or higher save that still has an unspent
    skill point into the mod's save folder (every file named `<Character>.*`). D2R reads
    saves only at startup. Any class works for G1; or
  - *outside town:* take the fresh character to level 2 and do not spend the point.

### 4. Check the build is known (in town)

Enter a game, then:

```powershell
dist\d2rr-ap.exe doctor -manifest dist\ap_gate.zip
```

`d2rBuild` names the D2R executable, `d2rBuildKnown` says whether the client has
measured offsets for it, and `offsetsResolved` should show both `ui` and `waypoints`
true. With `-manifest` it also checks the installed mod against the zip and the loaded
character's class against the mod. If `d2rBuildKnown` is false after a D2R patch, follow "After a D2R patch" in
`DESIGN_NOTES.md` before the gates: without the UI offset the client grants nothing.

Stat ids used below: 4 stat points, 5 skill points, 6 life, 8 mana, 10 stamina, 14 gold,
368 Horadric Keys (count + 1), 369 mailbox.

## G1: is a written skill point honoured?

Load the character with an unspent skill point (Offline).

1. **In town.** Note its unspent points, then:

   ```powershell
   dist\d2rr-ap.exe probe
   dist\d2rr-ap.exe probe -set 5=3
   ```

   `probe -set` writes both copies of the character (the game's own copy, then the one
   the screen shows), as the client does; `gameCopy` in the output is the address it
   found. The skill tree should show 3 points. *(If not, the write did not reach the
   display: stop here and keep the two outputs.)*
2. **In town.** Spend all 3, ideally on an attack, a summon and an aura, the three kinds
   that failed with the old design. `probe` again: `skillLevels` should list the three
   skills at level 1 (the ids are skills.txt rows), and stat 5 is now gone from
   `baseStats` (the game removes a stat at zero).
3. **In town.** Save and Exit, re-enter, `probe`: the three skills are still there.
4. **Outside town.** Use them. The attack must hit with its own effect (not a generic
   swing), the summon must appear and fight, and the aura must switch on.

**Pass:** steps 1 to 3 (and 4 when you can leave town). Skill points are sound on this
build.

**Fail** (points show but do not spend, spend and are not learned, or vanish on
re-entry): run `dist\d2rr-ap.exe probe -copies`. It lists every copy of the character in
memory (it takes a few minutes). For each `unit`, try `probe -unit 0x... -set 5=3`, which
writes that copy only. If a copy other than `gameCopy` makes the points real, the
client is finding the wrong copy; if none does, writing from outside the game no longer
works on this build and nothing below is worth running.

## G2: can the mod create a stat for the client to write?

**Known to fail** on 3.3: the Draught's spell ignores the stat columns. It cannot pass
until keys and runes get a new mechanism (a starter save, say). Keep it for that
mechanism, or to confirm a D2R patch did not change the answer.

**In town**, with the fresh character:

1. `dist\d2rr-ap.exe probe`: stats 5, 368 and 369 are absent.
2. Right-click the **Draught of Attunement**, then `probe` again.

**Pass:** 368 is 1, 369 is 256 and 5 is 1, and all three are still there after Save and
Exit and re-entering. On 3.3 the Draught instead gives +1 to a random attribute, like an
Elixir.

## G3: does a Cube recipe obey a stat?

**In town**, fresh character, Cube open.

1. Put the **Sigil alone** in the Cube and transmute. With 369 absent (or 1, idle), the
   brew recipe fires: expect a second Draught and the Sigil back. **Passes on 3.3.**

The rune half needs a 369 entry to write, which only G2 can create, so it **cannot pass
yet**. Once a mechanism exists:

2. `dist\d2rr-ap.exe probe -set 369=2`, transmute the Sigil alone. Expect an **El Rune**,
   the other Sigil and an **Archipelago Receipt**.
3. Transmute the Sigil alone **again** without using the Receipt. Expect **nothing**:
   the exactly-once guarantee depends on the Cube refusing here.
4. Right-click the Receipt, then `probe`. Stat 369 should read 3.
5. `dist\d2rr-ap.exe probe -set 369=8`, transmute. Expect an **Eld Rune** (offer 8 is
   the Eld for the second Sigil, the one now held).

**Pass:** all five. Runes then work, and so do key gates, which use the same mechanism:
the Horadric Staff recipe needs stat 368 at 3 or more, Khalim's Will at 6 or more.

## G4: traps and DeathLink

**Outside town**, any character, mana and stamina partly full.

```powershell
dist\d2rr-ap.exe probe -set 8=0 -set 10=0
dist\d2rr-ap.exe probe -set 6=256
dist\d2rr-ap.exe probe -set 6=0
```

**Pass for traps:** mana and stamina empty at once and behave as empty (no casting, no
running); life drops to 1 and the next hit kills.

**DeathLink:** after `6=0`, does the character die? Either answer is fine. The client
checks and falls back to leaving the character on one life if the game ignores the
write; record which happens so the docs can say so.

## G5: a real room

**Outside town.** Only after G1 passes.

1. Generate a room in the Archipelago Launcher with a YAML from the `/archipelago` page
   of the dev server (goal Andariel on Normal is enough; leave the "not working"
   options off), and host it.
2. With the game closed:

   ```powershell
   dist\d2rr-ap.exe -host localhost -port <port> -slot <name> -base-url http://localhost:3210 -launch
   ```

   `-base-url` points the mod download at the dev server. `-launch` installs the room's
   mod and starts D2R.
3. Create a new character of the room's class and play to the goal. Watch that:
   - points arrive and match the client's log, and skills bought with them work;
   - checks reach the room as you complete quests, take waypoints, enter areas and level;
   - after Save and Exit and a client restart, nothing is granted twice;
   - on a level-up, the point the game hands out is taken back within a second;
   - killing the goal boss prints `GOAL COMPLETE`;
   - from the server console, `/send <name> Mana Burn Trap` (and anything else you
     enabled) arrives.

## Recording results

For a gate that fails, keep the `probe` output before and after and a note of what the
game showed. Add the results, with the D2R build from `doctor`, to "Gate results" in
`DESIGN_NOTES.md`. An option moves from "not working" or experimental to supported only
when its gate has passed.

## The automated checks

```powershell
npm run ap:test                       # tables, id and option cross-checks, client unit tests
node scripts/dev-cold-cache.mjs       # a dev server on :3210 with throwaway state, for the next three
node scripts/verify-ap-mode.mjs       # the mod's tables, 8 classes and option mixes
node scripts/build-apworld.mjs --install
node scripts/verify-apworld-fill.mjs  # real multiworlds, each audited from its spoiler
node scripts/verify-ap-room.mjs       # the client against a real hosted room
```
