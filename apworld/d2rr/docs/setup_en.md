# D2R Randomizer Setup Guide

## Required software

- Diablo II: Resurrected, installed and able to start an **offline** character.
- [Archipelago](https://github.com/ArchipelagoMW/Archipelago/releases) 0.6.7 or newer.
- `d2rr.apworld` and the companion client `d2rr-ap.exe`, both from
  [d2rrandomizer.com/archipelago](https://d2rrandomizer.com/archipelago).

The mod only works offline. The client refuses to touch the game while it is connected
to Battle.net.

## Installing the apworld

Double-click `d2rr.apworld`, or use **Install APWorld** in the Archipelago Launcher, then
restart the Launcher.

## Creating your options file

Use the options builder on the page above, or start from this:

```yaml
name: YourName
game: D2R Randomizer
D2R Randomizer:
  character_class: paladin
  goal_difficulty: normal
  goal_boss: baal
  skill_points: 110
  starting_skill_points: 1
  xp_multiplier: 2
```

`goal_boss: andariel` on Normal is about an hour and suits a first try. Everything
marked EXPERIMENTAL in the options is off by default; leave it off for a run that has
to finish.

## Joining a game

1. Close Diablo II: Resurrected.
2. Start the client with your room's address, port and slot name:

   ```
   d2rr-ap.exe -host archipelago.gg -port 12345 -slot YourName -launch
   ```

   `-launch` downloads the mod for your slot, installs it into the game's `mods` folder
   and starts the game with it. Use `-install` to install without starting the game, and
   `-game-dir` if the game is not in a standard location.
3. Play **Offline** and create a new character of the class in your options. The client
   prints the save folder it is watching; the character must be created by this mod, so
   it lands there.
4. Leave the client running while you play.

One slot is bound to one character. Use `-character Name` if the folder holds several.

## Playing

- Skill points arrive as unspent points. Open the skill tree and spend them anywhere.
- Your first points become spendable after your first level-up.
- Type into the client window to talk to the room. `!hint Progressive Skill Point` and
  the other `!` commands work as in any Archipelago client.
- The client sends checks as you complete quests, activate waypoints, enter areas and
  gain levels, and reports the goal when your goal boss dies.

### After Normal

On Nightmare and Hell the client needs to know which difficulty you are playing, to file
area checks correctly. Start it with `-difficulty 1` for Nightmare or `-difficulty 2` for
Hell, and restart it with the right number if you go back to an easier difficulty.

### Experimental items

- **Horadric Keys**: nothing to do. Once you hold enough, the Cube assembles the Horadric
  Staff and Khalim's Will as usual.
- **Runes**: when the client says a rune is waiting, put the **Archipelago Sigil** alone
  in the Horadric Cube and transmute. Take the rune, then right-click the
  **Archipelago Receipt** that came with it. The next rune is offered after that. Keep
  the Receipt until you have used it: it is what tells the client the rune arrived. If
  the Cube refuses a waiting rune, restart the client with `-mail-flip`.
- If the client says a stat is missing, right-click the **Draught of Attunement** you
  started with. Transmuting the Sigil alone brews another whenever no rune is waiting.

## Troubleshooting

Run `d2rr-ap.exe doctor -manifest <the downloaded mod zip>` with the game running and
your character loaded. It checks the installation, the character and the client's view
of your points, and changes nothing.

- **Nothing is granted.** The client says why, once a minute: the game is not running,
  the character is not the one bound to the slot, or the room's items have not finished
  arriving.
- **"incompatible room contract".** The apworld and the client are different versions.
  Update both and generate a new room; an existing room cannot be upgraded.
- **The game says the mod is missing.** Start the client with `-install` and the game
  closed, then start the game with the command the client prints.
