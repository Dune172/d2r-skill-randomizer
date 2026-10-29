"""Player options for D2R Randomizer."""

from dataclasses import dataclass

from Options import Choice, DeathLink, OptionGroup, PerGameCommonOptions, Range, Toggle


class CharacterClass(Choice):
    """Which class this slot plays.

    All eight D2R Randomizer classes are playable, Warlock included. The class is fixed
    when the multiworld is generated: it decides which mod the companion client fetches.
    """
    display_name = "Character Class"
    option_amazon = 0
    option_sorceress = 1
    option_necromancer = 2
    option_paladin = 3
    option_barbarian = 4
    option_druid = 5
    option_assassin = 6
    option_warlock = 7
    default = 3


class GoalDifficulty(Choice):
    """Which difficulty the goal boss must be killed on.

    Every earlier difficulty is played in full: Nightmare means all of Normal, then
    Nightmare up to the goal boss.
    """
    display_name = "Goal Difficulty"
    option_normal = 0
    option_nightmare = 1
    option_hell = 2
    default = 0


class GoalBoss(Choice):
    """Which act boss completes the slot, on the goal difficulty.

    Andariel on Normal is about an hour; Baal on Normal is an evening; Baal on Hell is a
    full playthrough. Acts after the goal boss carry no checks.
    """
    display_name = "Goal Boss"
    option_andariel = 0
    option_duriel = 1
    option_mephisto = 2
    option_diablo = 3
    option_baal = 4
    default = 4


class SkillPoints(Range):
    """How many skill points Archipelago hands out over the run.

    Each one is an unspent point YOU choose where to put. The game builds the skill when
    you spend it, so it works like any skill learned normally. Levelling up and quest
    rewards grant no skill points of their own.

    A character can absorb 30 skills x 20 points = 600. Around 110 matches a normal
    playthrough; more makes a far stronger character. Includes starting points.
    Lowered automatically if the chosen goal and checks cannot hold the request.
    """
    display_name = "Skill Points"
    range_start = 20
    range_end = 600
    default = 110


class StartingSkillPoints(Range):
    """Skill points you start with, taken out of the Skill Points total.

    Softens the wait for somebody else's first find.
    """
    display_name = "Starting Skill Points"
    range_start = 0
    range_end = 5
    default = 1


class LogicDifficulty(Choice):
    """How many skill points the logic expects you to hold before moving on.

    Relaxed opens later acts and difficulties with fewer points, strict with more. This
    only changes what generation considers reachable; it does not change the game.
    """
    display_name = "Logic Difficulty"
    option_relaxed = 0
    option_standard = 1
    option_strict = 2
    default = 1


class IncludeWaypoints(Toggle):
    """Activating a waypoint is a check. Turning this off shrinks the item pool."""
    display_name = "Waypoint Checks"
    default = 1


class IncludeAreas(Toggle):
    """Entering an area for the first time is a check.

    This is the largest group of checks by far. Turning it off makes for a much smaller,
    quest-driven slot.
    """
    display_name = "Area Checks"
    default = 1


class IncludeLevelMilestones(Toggle):
    """Reaching each character level is a check, up to roughly the level a character has
    when the goal boss dies. Nothing asks you to grind past that."""
    display_name = "Level Milestone Checks"
    default = 1


class KeyItems(Toggle):
    """EXPERIMENTAL. Put Progressive Horadric Keys in the multiworld.

    The Horadric Cube refuses to assemble the Horadric Staff until you hold 2 keys, and
    Khalim's Will until you hold 5. So Duriel and Mephisto wait on items that may be in
    anyone's world. You still collect the staff and Khalim's relics as usual.

    NOT WORKING in this preview: the key count lives in a stat that only a Draught of
    Attunement could create, and the game ignores the Draught's stats. With this on, the
    Staff and Khalim's Will cannot be assembled. Leave it off.
    """
    display_name = "Horadric Keys"
    default = 0


class StatPoints(Choice):
    """EXPERIMENTAL. Where attribute points come from.

    vanilla: five per level-up, as in the unmodded game.
    pooled: level-ups and quests grant none. Stat Points items, each worth five, are
    placed in the multiworld instead, one for every level the goal expects you to reach.

    NOT WORKING in this preview: the game drops the stat point entry when it reaches
    zero, and the client cannot create it again. Leave this on vanilla.
    """
    display_name = "Stat Points"
    option_vanilla = 0
    option_pooled = 1
    default = 0


class RunePercentage(Range):
    """EXPERIMENTAL. Share of filler items that are runes.

    A rune arrives through the Archipelago Sigil you start with: put the Sigil alone in
    the Horadric Cube, transmute, then use the Archipelago Receipt that comes out with
    the rune. Higher runes are rarer and only appear on higher goal difficulties.

    NOT WORKING in this preview: the mailbox stat cannot be created and the Receipt
    cannot acknowledge a delivery, so no rune would arrive. Leave this at 0.
    """
    display_name = "Rune Percentage"
    range_start = 0
    range_end = 100
    default = 0


class TrapPercentage(Range):
    """EXPERIMENTAL. Share of filler items that are traps.

    Mana Burn empties your mana, Exhaustion your stamina, Brush with Death leaves you on
    one life, Skill Lock withholds unspent skill points for a minute, and Gold Tax takes
    a share of the gold you carry. Traps wait until you are outside town.

    Not yet tested in the game.
    """
    display_name = "Trap Percentage"
    range_start = 0
    range_end = 100
    default = 0


class XPMultiplier(Range):
    """Multiplies experience from monsters, as on the D2R Randomizer site.

    Worth raising for a synchronous game, so nobody waits on your levelling.
    """
    display_name = "Experience Multiplier"
    range_start = 1
    range_end = 3
    default = 1


class MonsterShuffle(Toggle):
    """Shuffle which monsters appear in which areas, as on the D2R Randomizer site."""
    display_name = "Monster Shuffle"
    default = 0


class D2RRDeathLink(DeathLink):
    """EXPERIMENTAL. When you die, everyone else with DeathLink dies, and the reverse.

    Sending your own deaths needs nothing unusual. Whether an incoming death can actually
    kill your character is not yet confirmed in the game; if it cannot, it is applied as
    a Brush with Death instead and the client says so.
    """


@dataclass
class D2RROptions(PerGameCommonOptions):
    character_class: CharacterClass
    goal_difficulty: GoalDifficulty
    goal_boss: GoalBoss
    skill_points: SkillPoints
    starting_skill_points: StartingSkillPoints
    logic_difficulty: LogicDifficulty
    include_waypoints: IncludeWaypoints
    include_areas: IncludeAreas
    include_level_milestones: IncludeLevelMilestones
    key_items: KeyItems
    stat_points: StatPoints
    rune_percentage: RunePercentage
    trap_percentage: TrapPercentage
    xp_multiplier: XPMultiplier
    monster_shuffle: MonsterShuffle
    death_link: D2RRDeathLink


OPTION_GROUPS = [
    OptionGroup("Goal", [CharacterClass, GoalDifficulty, GoalBoss]),
    OptionGroup("Skill Points", [SkillPoints, StartingSkillPoints, LogicDifficulty]),
    OptionGroup("Checks", [IncludeWaypoints, IncludeAreas, IncludeLevelMilestones]),
    OptionGroup("The Mod", [XPMultiplier, MonsterShuffle]),
    OptionGroup("Experimental", [KeyItems, StatPoints, RunePercentage, TrapPercentage, D2RRDeathLink]),
]

OPTION_PRESETS = {
    "Quick Sync (Normal Andariel)": {
        "goal_difficulty": "normal",
        "goal_boss": "andariel",
        "skill_points": 40,
        "starting_skill_points": 2,
        "xp_multiplier": 2,
    },
    "An Evening (Normal Baal)": {
        "goal_difficulty": "normal",
        "goal_boss": "baal",
        "skill_points": 110,
        "xp_multiplier": 2,
    },
    "Full Playthrough (Hell Baal)": {
        "goal_difficulty": "hell",
        "goal_boss": "baal",
        "skill_points": 220,
        "logic_difficulty": "strict",
    },
}
