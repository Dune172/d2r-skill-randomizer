**Preview.** Generating a multiworld, connecting to a room and receiving skill points,
stat points and keys all work, checked in the game in town. A full run from start to goal
has not been played yet, so treat a run as a test and tell us how it went.

## Files

| File | What it is |
|---|---|
| `d2rr.apworld` | The world. Double-click it, or use *Install APWorld* in the Archipelago Launcher. |
| `d2rr-ap.exe` | The companion app. It fetches your slot's mod, installs it, starts the game and talks to the room. |
| `D2R Randomizer.yaml` | An options template. Or build one at https://d2rrandomizer.com/archipelago |
| `SHA256SUMS.txt` | Checksums of the above. |

The same files are always on https://d2rrandomizer.com/archipelago, which is the easiest
place to get them. Use the apworld and the app from the **same** place: a mismatched pair
is refused when the app connects, with a message saying so.

## Requirements

- Diablo II: Resurrected, played offline. The mod cannot be used on Battle.net, and the
  app refuses to act while the game is online.
- Archipelago 0.6.7 or newer.
- Windows.

## Playing

1. Install the apworld and make your player file (the page above has a builder).
2. Once the room is up, close Diablo II and double-click `d2rr-ap.exe`. Type the room's
   address, your name and the room's password, if it has one.
3. The app downloads and installs your slot's mod, makes your character (Acts II and III
   already open, the Open Acts option) and starts the game. Choose **Offline** and load
   that character.
4. Keep the app open while you play. Points arrive by themselves, and what you receive
   and send appears in the game beside the chat.

Past Normal, type `/difficulty nightmare` or `/difficulty hell` in the app's window when
you start that difficulty: the game does not say which one you are on, and area checks
need it. The full guide ships inside the apworld.

## Known limits

- Pooled stat points are on by default and Horadric Keys are off; both are checked in
  town but not over a full run. Traps and DeathLink have not been tried in the game.
- A skill still takes at most one point per level past its requirement. The game
  enforces that in its own code, so points that arrive early wait.
- The app is unsigned, and it reads and writes the game's memory, so Windows SmartScreen
  and some antivirus software warn about it. PCs with Smart App Control on may refuse to
  run it.
- A D2R patch can break the app until it is updated.

Problems and questions: https://github.com/Dune172/d2r-skill-randomizer/issues. Each run
of the app writes a log under `%AppData%\d2rr-ap\logs`; please attach it.
