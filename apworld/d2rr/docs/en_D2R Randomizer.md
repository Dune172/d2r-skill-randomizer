# D2R Randomizer

## What is this game?

[D2R Randomizer](https://d2rrandomizer.com) is a mod generator for Diablo II: Resurrected
that shuffles every skill in the game across all eight classes, Warlock included. Your
Paladin's tree might hold Teeth, Fire Wall and Multiple Shot.

It is an offline, single-player mod. It cannot be used on Battle.net.

With Open Acts (on by default), Acts II and III are open from the start: the companion app
makes your character with Lut Gholein's and Kurast Docks' waypoints active. Duriel and
Mephisto still need their quests, and Acts IV and V open as in the base game.

## What does randomization do in a multiworld?

Your skill tree is shuffled by the mod. What the multiworld controls is **when you get
to use it**: levelling up and quest rewards give you no skill points. Skill points are
items, found by you and by everyone else.

## What are the items?

- **Progressive Skill Point**: one unspent skill point. You choose where it goes, and
  the game builds the skill when you spend it. Skills keep their usual level
  requirements (1, 6, 12, 18, 24 and 30 by row), and the usual limit of one point in a
  skill per level past its requirement, so a point that arrives early waits until you
  are old enough for the skill you want.
- **Stat Points**: five attribute points, replacing the five you would get per level.
  On by default; with the `stat_points` option set to `vanilla`, levelling grants them
  as usual and these items are not placed.
- **Gold**: filler, scaled to your level.

Experimental, each off unless you turn it on:

- **Progressive Horadric Key**: the Horadric Cube will not assemble the Horadric Staff
  until you hold two, or Khalim's Will until you hold five. Duriel and Mephisto wait on
  them.
- **Traps**: Mana Burn, Exhaustion, Brush with Death, Skill Lock and Gold Tax.

Keys and Stat Points have been checked in the game in town but not yet over a full run;
traps are untested. Everything arrives by itself while the companion app is running.

## What are the locations?

- Completing a quest.
- Activating a waypoint (not a town's).
- Entering an area for the first time (not a town).
- Reaching a character level, up to about the level you would have at the goal.
- Optionally (experimental), killing a named super-unique such as Bishibosh or Pindleskin.

Each group except quests can be switched off.

## What is the goal?

By default, killing an act boss of your choice (Andariel, Duriel, Mephisto, Diablo or
Baal) on the difficulty of your choice. Earlier difficulties are played in full first.
`goal_type` offers other goals:

- `all_bosses`: kill all five act bosses on the goal difficulty.
- `check_percentage`: find a share of your own checks (`goal_check_percentage`, 60 by
  default). Checks still stop at the goal boss, but killing it is not required.
- `cow_king` (experimental): kill the Cow King on the goal difficulty, after that
  difficulty's Baal. It counts once the game has saved.

## What does another player's item look like?

Nothing drops in the game. A line such as "You sent Progressive Skill Point to Alice"
appears in a text box beside the chat, and the companion app's window shows it too. Hints
about your items, room chat and other players finishing appear there as well.

## What do I need?

Diablo II: Resurrected, this apworld, and the D2R Randomizer companion client, which
downloads the right mod for your slot and talks to the Archipelago server. See the setup
guide.
