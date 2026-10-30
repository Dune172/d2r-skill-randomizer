"""Archipelago item and location tables for D2R Randomizer.

THIS IS A CONTRACT WITH THE COMPANION CLIENT. The apworld generates offline, with no
access to the game or the client, so both sides derive ids from the same fixed ordering
rather than exchanging data. The Go side is tools/ap-client/internal/ids, and
scripts/verify-ap-ids.mjs diffs the two tables: they must agree exactly.

IDS ARE IMMUTABLE once a multiworld exists. Changing one silently re-keys every in-flight
room, so the orderings below are written out explicitly instead of being derived from
anything that could later be reordered. Add at the end; never renumber.

Deliberately free of Archipelago imports, so apworld/dev can load it without Archipelago
for the cross-check and the table tests.
"""

from .areas import AREA_ACTS, AREA_LABELS, AREA_LEVEL_IDS

ITEM_BASE = 5_720_000
LOCATION_BASE = 5_721_000

DIFFICULTIES = 3
ACTS = 5
WAYPOINTS = 39
AREAS = len(AREA_LEVEL_IDS)  # 131

# D2RR class codes, in CLASS_DEFS order. Warlock is a full D2RR class.
CLASSES: list[str] = ["ama", "sor", "nec", "pal", "bar", "dru", "ass", "war"]

DIFFICULTY_NAMES = ["Normal", "Nightmare", "Hell"]
ACT_NAMES = ["Act I", "Act II", "Act III", "Act IV", "Act V"]

# ---------------------------------------------------------------------------------------
# Items
# ---------------------------------------------------------------------------------------

# THE progression item: one unspent skill point. Archipelago decides WHEN you get points,
# not which skills you end up with: the player spends the point and the game builds the
# skill, which is why it then behaves like any skill learned normally.
SKILL_POINT_ITEM = "Progressive Skill Point"
SKILL_POINT_ID = ITEM_BASE + 2000

# Filler. Five fragments make one bonus skill point, on top of the progression total.
TRAINING_FRAGMENT_ITEM = "Training Fragment"
TRAINING_FRAGMENT_ID = ITEM_BASE + 2001
FRAGMENTS_PER_POINT = 5

# One level-up's worth of attribute points, when the slot pools them.
STAT_POINTS_ITEM = "Stat Points"
STAT_POINTS_ID = ITEM_BASE + 2002
STAT_POINTS_PER_ITEM = 5

# Opens the Horadric Cube's two quest recipes: 2 for the Horadric Staff (Duriel), 5 for
# Khalim's Will (Mephisto). Progressive because the game needs them in that order.
HORADRIC_KEY_ITEM = "Progressive Horadric Key"
HORADRIC_KEY_ID = ITEM_BASE + 2003
KEYS_FOR_HORADRIC_STAFF = 2
KEYS_FOR_KHALIMS_WILL = 5

GOLD_ITEM = "Gold"
GOLD_ID = ITEM_BASE + 2004

# Traps. Each one only changes a value the character already has.
TRAP_ITEMS: list[str] = [
    "Mana Burn Trap",         # mana to zero
    "Exhaustion Trap",        # stamina to zero
    "Brush with Death Trap",  # life to one
    "Skill Lock Trap",        # unspent skill points withheld for a minute
    "Gold Tax Trap",          # a share of carried gold is lost
]
TRAP_ID_BASE = ITEM_BASE + 2010

# Runes. RESERVED: runes were taken out of the game on 2026-10-30 and are never placed.
# Their names and ids stay defined so ids never move and the client's tables still agree
# (scripts/verify-ap-ids.mjs). A later version may place them again under these ids.
RUNE_NAMES: list[str] = [
    "El", "Eld", "Tir", "Nef", "Eth", "Ith", "Tal", "Ral", "Ort", "Thul", "Amn", "Sol",
    "Shael", "Dol", "Hel", "Io", "Lum", "Ko", "Fal", "Lem", "Pul", "Um", "Mal", "Ist",
    "Gul", "Vex", "Ohm", "Lo", "Sur", "Ber", "Jah", "Cham", "Zod",
]
RUNE_ID_BASE = ITEM_BASE + 2100

# A D2 character can hold 30 skills x 20 hard points. More points than that are
# unspendable, so the pool never needs to exceed it.
SKILLS_PER_CLASS = 30
MAX_SKILL_POINTS = SKILLS_PER_CLASS * 20

# Largest share of locations that may hold PROGRESSION items. Measured: at ~91%
# progression, generation failed NONDETERMINISTICALLY, the same options succeeding or
# raising FillError depending on the seed.
PROGRESSION_DENSITY_CAP = 0.70


def rune_item_name(index: int) -> str:
    return f"{RUNE_NAMES[index]} Rune"


def rune_item_id(index: int) -> int | None:
    return RUNE_ID_BASE + index if 0 <= index < len(RUNE_NAMES) else None


def trap_item_id(index: int) -> int | None:
    return TRAP_ID_BASE + index if 0 <= index < len(TRAP_ITEMS) else None


def all_item_names() -> dict[str, int]:
    """Every item name -> id, identical for every slot whatever its options."""
    out: dict[str, int] = {
        SKILL_POINT_ITEM: SKILL_POINT_ID,
        TRAINING_FRAGMENT_ITEM: TRAINING_FRAGMENT_ID,
        STAT_POINTS_ITEM: STAT_POINTS_ID,
        HORADRIC_KEY_ITEM: HORADRIC_KEY_ID,
        GOLD_ITEM: GOLD_ID,
    }
    for i, name in enumerate(TRAP_ITEMS):
        out[name] = TRAP_ID_BASE + i
    for i in range(len(RUNE_NAMES)):
        out[rune_item_name(i)] = RUNE_ID_BASE + i
    return out


# ---------------------------------------------------------------------------------------
# Goals
# ---------------------------------------------------------------------------------------

# The act boss whose death completes the slot, by act, and the quest that records it.
GOAL_BOSSES: list[str] = ["Andariel", "Duriel", "Mephisto", "Diablo", "Baal"]
GOAL_QUEST_INDEX: list[int] = [5, 5, 5, 1, 5]
BAAL_ACT = 4

# Roughly the character level on leaving each act, per difficulty. A level milestone
# beyond the goal's figure is not a location: it is somebody else's item stranded behind
# a grind the player would never otherwise do.
LEVEL_CAPS: list[list[int]] = [
    [12, 18, 24, 27, 30],
    [38, 43, 48, 51, 55],
    [62, 66, 70, 72, 75],
]
LEVEL_MIN = 2
LEVEL_MAX = 99


def level_cap(goal_difficulty: int, goal_act: int = BAAL_ACT) -> int:
    return LEVEL_CAPS[goal_difficulty][goal_act]


def acts_in(difficulty: int, goal_difficulty: int, goal_act: int = BAAL_ACT) -> int:
    """How many acts of a difficulty carry checks: all five below the goal's difficulty,
    up to and including the goal's act on it, none above."""
    if difficulty < goal_difficulty:
        return ACTS
    return goal_act + 1 if difficulty == goal_difficulty else 0


def keys_in_pool(key_items: bool, goal_difficulty: int, goal_act: int = BAAL_ACT) -> int:
    """How many Progressive Horadric Keys the slot needs. A goal that never reaches a
    locked recipe carries no keys for it."""
    if not key_items:
        return 0
    if goal_difficulty > 0 or goal_act >= 2:
        return KEYS_FOR_KHALIMS_WILL
    return KEYS_FOR_HORADRIC_STAFF if goal_act == 1 else 0


# ---------------------------------------------------------------------------------------
# Locations
# ---------------------------------------------------------------------------------------

# Act IV has 3 quests, the rest 6: 27 per difficulty.
QUESTS_PER_ACT: list[int] = [6, 6, 6, 3, 6]

QUEST_NAMES: list[list[str]] = [
    ["Den of Evil", "Sisters' Burial Grounds", "Tools of the Trade",
     "The Search for Cain", "The Forgotten Tower", "Sisters to the Slaughter"],
    ["Radament's Lair", "The Horadric Staff", "Tainted Sun",
     "Arcane Sanctuary", "The Summoner", "The Seven Tombs"],
    ["Lam Esen's Tome", "Khalim's Will", "Blade of the Old Religion",
     "The Golden Bird", "The Blackened Temple", "The Guardian"],
    ["The Fallen Angel", "Terror's End", "Hell's Forge"],
    ["Siege on Harrogath", "Rescue on Mount Arreat", "Prison of Ice",
     "Betrayal of Harrogath", "Rite of Passage", "Eve of Destruction"],
]

# Waypoint display names, in the game's waypoint order.
WAYPOINT_NAMES: list[str] = [
    # Act I (0-8)
    "Rogue Encampment", "Cold Plains", "Stony Field", "Dark Wood", "Black Marsh",
    "Outer Cloister", "Jail Level 1", "Inner Cloister", "Catacombs Level 2",
    # Act II (9-17)
    "Lut Gholein", "Sewers Level 2", "Dry Hills", "Halls of the Dead Level 2",
    "Far Oasis", "Lost City", "Palace Cellar Level 1", "Arcane Sanctuary",
    "Canyon of the Magi",
    # Act III (18-26)
    "Kurast Docks", "Spider Forest", "Great Marsh", "Flayer Jungle", "Lower Kurast",
    "Kurast Bazaar", "Upper Kurast", "Travincal", "Durance of Hate Level 2",
    # Act IV (27-29)
    "The Pandemonium Fortress", "City of the Damned", "River of Flame",
    # Act V (30-38)
    "Harrogath", "Frigid Highlands", "Arreat Plateau", "Crystalline Passage",
    "Halls of Pain", "Glacial Trail", "Frozen Tundra", "The Ancients' Way",
    "Worldstone Keep Level 2",
]

# Which waypoint indices belong to which act. Act IV has only 3 waypoints.
WAYPOINT_ACT_BOUNDS: list[tuple[int, int]] = [(0, 9), (9, 18), (18, 27), (27, 30), (30, 39)]


def waypoints_for_act(act: int) -> range:
    start, end = WAYPOINT_ACT_BOUNDS[act]
    return range(start, end)


def waypoint_act(index: int) -> int:
    for act, (start, end) in enumerate(WAYPOINT_ACT_BOUNDS):
        if start <= index < end:
            return act
    raise ValueError(f"waypoint {index} out of range")


def area_act(index: int) -> int:
    """0-based act an area sits in."""
    return AREA_ACTS[index]


def area_index_for_level_id(level_id: int) -> int | None:
    """Map a levels.txt Id, which is what D2R reports as the player's area, to a table index."""
    try:
        return AREA_LEVEL_IDS.index(level_id)
    except ValueError:
        return None


def quests_total() -> int:
    """81: 27 quests across 3 difficulties."""
    return sum(QUESTS_PER_ACT) * DIFFICULTIES


def waypoints_total() -> int:
    """117: 39 waypoints across 3 difficulties."""
    return DIFFICULTIES * WAYPOINTS


def areas_total() -> int:
    """393: 131 areas across 3 difficulties."""
    return DIFFICULTIES * AREAS


def levels_total() -> int:
    """98: character levels 2 through 99."""
    return LEVEL_MAX - LEVEL_MIN + 1


def locations_total() -> int:
    """689: 81 quests + 117 waypoints + 393 areas + 98 level milestones, laid out in
    that order, each group appended after the last."""
    return quests_total() + waypoints_total() + areas_total() + levels_total()


def _quest_seq(difficulty: int, act: int, index: int) -> int | None:
    """Flat position: difficulty, then act, then index within the act."""
    if not 0 <= difficulty < DIFFICULTIES or not 0 <= act < len(QUESTS_PER_ACT):
        return None
    if not 0 <= index < QUESTS_PER_ACT[act]:
        return None
    return difficulty * sum(QUESTS_PER_ACT) + sum(QUESTS_PER_ACT[:act]) + index


def quest_location_id(difficulty: int, act: int, index: int) -> int | None:
    seq = _quest_seq(difficulty, act, index)
    return None if seq is None else LOCATION_BASE + seq


def waypoint_location_id(difficulty: int, index: int) -> int | None:
    if not 0 <= difficulty < DIFFICULTIES or not 0 <= index < WAYPOINTS:
        return None
    return LOCATION_BASE + quests_total() + difficulty * WAYPOINTS + index


def area_location_id(difficulty: int, index: int) -> int | None:
    if not 0 <= difficulty < DIFFICULTIES or not 0 <= index < AREAS:
        return None
    return LOCATION_BASE + quests_total() + waypoints_total() + difficulty * AREAS + index


def level_location_id(clvl: int) -> int | None:
    if not LEVEL_MIN <= clvl <= LEVEL_MAX:
        return None
    base = quests_total() + waypoints_total() + areas_total()
    return LOCATION_BASE + base + (clvl - LEVEL_MIN)


def quest_location_name(difficulty: int, act: int, index: int) -> str:
    return f"{DIFFICULTY_NAMES[difficulty]} A{act + 1}: {QUEST_NAMES[act][index]}"


def waypoint_location_name(difficulty: int, index: int) -> str:
    return f"{DIFFICULTY_NAMES[difficulty]} WP: {WAYPOINT_NAMES[index]}"


def area_location_name(difficulty: int, index: int) -> str:
    return f"{DIFFICULTY_NAMES[difficulty]} Area: {AREA_LABELS[index]}"


def level_location_name(clvl: int) -> str:
    """Not difficulty-scoped: a character has one level, across all three difficulties."""
    return f"Level {clvl}"


def all_location_names() -> dict[str, int]:
    """Every location name -> id. Complete and identical for every slot of this game."""
    out: dict[str, int] = {}
    for d in range(DIFFICULTIES):
        for act, count in enumerate(QUESTS_PER_ACT):
            for i in range(count):
                out[quest_location_name(d, act, i)] = quest_location_id(d, act, i)  # type: ignore[assignment]
        for i in range(WAYPOINTS):
            out[waypoint_location_name(d, i)] = waypoint_location_id(d, i)  # type: ignore[assignment]
        for i in range(AREAS):
            out[area_location_name(d, i)] = area_location_id(d, i)  # type: ignore[assignment]
    for clvl in range(LEVEL_MIN, LEVEL_MAX + 1):
        out[level_location_name(clvl)] = level_location_id(clvl)  # type: ignore[assignment]
    return out


# ---------------------------------------------------------------------------------------
# Regions
# ---------------------------------------------------------------------------------------

# Two places in the game sit behind a Horadric Cube quest recipe. They are regions of
# their own so a key gate has somewhere to stand.
TAL_RASHA = "tal_rasha"   # Duriel: needs the Horadric Staff
DURANCE = "durance"       # Mephisto: needs Khalim's Will

_GATED_QUESTS = {(1, 1): TAL_RASHA, (1, 5): TAL_RASHA, (2, 1): DURANCE, (2, 5): DURANCE}
_GATED_WAYPOINTS = {WAYPOINT_NAMES.index("Durance of Hate Level 2"): DURANCE}
_GATED_AREAS = {
    AREA_LABELS.index("Duriel's Lair"): TAL_RASHA,
    AREA_LABELS.index("Durance of Hate Level 1"): DURANCE,
    AREA_LABELS.index("Durance of Hate Level 2"): DURANCE,
    AREA_LABELS.index("Durance of Hate Level 3"): DURANCE,
}


def quest_gate(act: int, index: int) -> str | None:
    """Which gated sub-region a quest sits in, or None for the act itself."""
    return _GATED_QUESTS.get((act, index))


def waypoint_gate(index: int) -> str | None:
    return _GATED_WAYPOINTS.get(index)


def area_gate(index: int) -> str | None:
    return _GATED_AREAS.get(index)


def level_milestone_region(clvl: int, goal_difficulty: int,
                           goal_act: int = BAAL_ACT) -> tuple[int, int] | None:
    """Which (difficulty, act) a level milestone hangs off.

    Character level is global, so nothing about the game forces a milestone into a
    particular region. Logic needs one, though, and putting them all in sphere 0 would
    hand the fill a pile of free locations. Each milestone sits in the act a character
    is usually in when reaching that level.
    """
    if not LEVEL_MIN <= clvl <= level_cap(goal_difficulty, goal_act):
        return None
    for difficulty in range(goal_difficulty + 1):
        for act in range(acts_in(difficulty, goal_difficulty, goal_act)):
            if clvl <= LEVEL_CAPS[difficulty][act]:
                return difficulty, act
    return None


# The five act towns, on every difficulty, are never checks: neither the town nor its
# waypoint. A character stands in a town to begin each act and its waypoint is active
# on arrival, so they only paid out points for nothing (a new character had two before
# it could move), and those points reached the player at the game's next save, reading
# as random. They keep their ids (ids never move) and are simply never made locations.
TOWNS: list[str] = ["Rogue Encampment", "Lut Gholein", "Kurast Docks",
                    "The Pandemonium Fortress", "Harrogath"]


def town_checks() -> set[str]:
    out: set[str] = set()
    for d in range(DIFFICULTIES):
        for town in TOWNS:
            out.add(waypoint_location_name(d, WAYPOINT_NAMES.index(town)))
            out.add(area_location_name(d, AREA_LABELS.index(town)))
    return out


def active_location_names(goal_difficulty: int, include_waypoints: bool = True,
                          include_areas: bool = True, include_levels: bool = True,
                          goal_act: int = BAAL_ACT) -> list[str]:
    """Location names for a slot with this goal.

    Anything past the goal is excluded: it would be unreachable, and Archipelago treats
    an unreachable location as a generation failure.
    """
    out: list[str] = []
    for d in range(goal_difficulty + 1):
        acts = acts_in(d, goal_difficulty, goal_act)
        for act in range(acts):
            for i in range(QUESTS_PER_ACT[act]):
                out.append(quest_location_name(d, act, i))
            if include_waypoints:
                for i in waypoints_for_act(act):
                    out.append(waypoint_location_name(d, i))
        if include_areas:
            for i in range(AREAS):
                if area_act(i) < acts:
                    out.append(area_location_name(d, i))
    if include_levels:
        for clvl in range(LEVEL_MIN, level_cap(goal_difficulty, goal_act) + 1):
            out.append(level_location_name(clvl))
    towns = town_checks()
    return [name for name in out if name not in towns]


# ---------------------------------------------------------------------------------------
# Pool sizing
# ---------------------------------------------------------------------------------------

def resolve_pool(locations: int, *, skill_points: int, starting_skill_points: int = 0,
                 keys: int = 0, stat_bundles: int = 0, trap_percentage: int = 0) -> dict[str, int]:
    """Fit the item pool to the locations that exist, exactly.

    Archipelago requires one item per location. Asking for more than fits would surface
    inside its fill as an opaque error long after the option that caused it, so requests
    are trimmed here instead, in order of how much a slot needs them:

      keys           whatever the goal needs; never trimmed
      skill points   as requested, capped by what a character can spend and by the
                     progression density limit, never below one
      stat points    as many bundles as still fit
      filler         everything left over: a share of traps, and the rest alternating
                     Training Fragments and Gold

    Starting skill points are part of the skill point total but are handed out at the
    start rather than placed, so they free their locations for filler.
    """
    keys = min(keys, max(0, locations - 1))
    budget = int(locations * PROGRESSION_DENSITY_CAP) - keys
    points = max(1, min(skill_points, MAX_SKILL_POINTS, budget, locations - keys))
    starting = min(starting_skill_points, points)
    placed = points - starting

    free = locations - keys - placed
    stats = min(stat_bundles, free)
    filler = free - stats
    traps = filler * trap_percentage // 100
    rest = filler - traps
    gold = rest // 3
    return {
        "keys": keys,
        "skill_points": points,
        "starting_skill_points": starting,
        "placed_skill_points": placed,
        "stat_bundles": stats,
        "traps": traps,
        "gold": gold,
        "fragments": rest - gold,
    }
