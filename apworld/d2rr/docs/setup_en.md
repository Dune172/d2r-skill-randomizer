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
2. Double-click `d2rr-ap.exe`. It asks for the room's address (for example
   `archipelago.gg:12345`), your name in the room and the room's password, if it has
   one. It finds the game on its own, or asks for its folder. Next time, press Enter to
   rejoin the same room.

   Windows may warn about an unrecognised app the first time: choose **More info**, then
   **Run anyway**.
3. The app downloads the mod for your slot, installs it into the game's `mods` folder,
   makes your character and starts the game. Play **Offline** and load that character:
   Acts II and III are already open (the Open Acts option, on by default). With Open Acts
   off, create a new character of the class in your options instead; it must be created
   with this mod, so its save lands in the folder the app watches.
4. Play, and leave the app open while you do. Your items arrive by themselves.

One slot is bound to one character. If the mod changes (a new room, say), the app asks
you to close the game, then reinstalls the mod and starts the game again.

From a command prompt the same thing is
`d2rr-ap.exe -host archipelago.gg -port 12345 -slot YourName -launch`, with `-install`
to install without starting the game, `-game-dir` if the game is not in a standard
location, and `-character Name` if the save folder holds several characters.

## Playing

- Skill points arrive as unspent points while the app is running, a second or two after
  the room sends them. Open the skill tree and spend them anywhere. There is nothing to
  drink or transmute, and points sent after you have spent your last one arrive too.
- "You received X from Y" and "You sent X to Y" appear in the game, in a text box beside
  the chat at the bottom left, in any display mode. The app's window shows them as well.
- Type into the app's window to talk to the room. `!hint Progressive Skill Point` and
  the other `!` commands work as in any Archipelago client.
- The app sends checks as you complete quests, activate waypoints, enter areas and
  gain levels, and reports the goal when your goal boss dies. Towns are never checks,
  neither the town nor its waypoint.

### After Normal

On Nightmare and Hell the client needs to know which difficulty you are playing, to file
area checks correctly. Start it with `-difficulty 1` for Nightmare or `-difficulty 2` for
Hell, and restart it with the right number if you go back to an easier difficulty.

### Experimental items

- **Horadric Keys**: they arrive by themselves while the app is running. Once you hold
  enough, the Cube assembles the Horadric Staff and Khalim's Will as usual.
- **Pooled stat points**: they arrive like skill points, as unspent points to put where
  you like.

Keys and pooled stat points have been checked in the game in town, but not yet over a
full run. Leave them off for a run that has to finish. Runes are not in the game for
now.

Now and then the game has no room on your character for something new yet. The app then
waits, and what you were sent arrives after your next level-up, quest reward or item.

## Troubleshooting

Run `d2rr-ap.exe doctor -manifest <the downloaded mod zip>` (from a command prompt) with
the game running and
your character loaded. It checks the installation, the character and the client's view
of your points, and changes nothing.

- **Nothing is granted.** The client says why, once a minute: the game is not running,
  the character is not the one bound to the slot, or the room's items have not finished
  arriving.
- **"incompatible room contract".** The apworld and the client are different versions.
  Update both and generate a new room; an existing room cannot be upgraded.
- **The game says the mod is missing.** Close the game and start the app again: it
  installs the mod and starts the game with it.
- **Windows blocked the app.** Smart App Control or antivirus software can block a new
  download. Check that it came from d2rrandomizer.com, then allow it there.
