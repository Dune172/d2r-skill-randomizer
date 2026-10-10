"""D2R Randomizer — Archipelago world.

D2R Randomizer shuffles every skill in Diablo II: Resurrected across all eight classes.
In a multiworld the skill POINTS become the items: quests, waypoints, areas and character
levels are the checks, and each Progressive Skill Point found for you is a point you
spend wherever you like in your shuffled tree.

Generation happens offline and never contacts d2rrandomizer.com. The world picks a seed
and hands it to the companion client through slot_data; the client fetches exactly that
mod. The id tables in ids.py are a contract with that client, and
scripts/verify-ap-ids.mjs diffs the two implementations.
"""

import hashlib

from typing import Any, Dict, List, Optional

from BaseClasses import Item, ItemClassification, Location, Region, Tutorial
from worlds.AutoWorld import WebWorld, World

from . import ids, rules
from .options import OPTION_GROUPS, OPTION_PRESETS, D2RROptions

# Bumped when slot_data changes in a way the client must understand.
SLOT_CONTRACT_VERSION = 4

# Many identical progression items: keep them off priority locations and out of
# progression balancing, where one more copy of a point does nothing useful.
SKILL_POINT_CLASSIFICATION = getattr(
    ItemClassification, "progression_deprioritized_skip_balancing",
    ItemClassification.progression_skip_balancing,
)


class D2RRItem(Item):
    game = "D2R Randomizer"


class D2RRLocation(Location):
    game = "D2R Randomizer"


class D2RRWeb(WebWorld):
    theme = "dirt"
    option_groups = OPTION_GROUPS
    options_presets = OPTION_PRESETS
    tutorials = [Tutorial(
        "Multiworld Setup Guide",
        "A guide to playing D2R Randomizer with Archipelago.",
        "English",
        "setup_en.md",
        "setup/en",
        ["swannysoft"],
    )]


def _location_groups() -> Dict[str, set]:
    groups: Dict[str, set] = {name: set() for name in ids.DIFFICULTY_NAMES + ids.ACT_NAMES}
    groups.update({"Quests": set(), "Waypoints": set(), "Areas": set(), "Level Milestones": set()})
    for d in range(ids.DIFFICULTIES):
        for act, count in enumerate(ids.QUESTS_PER_ACT):
            for i in range(count):
                name = ids.quest_location_name(d, act, i)
                for group in (ids.DIFFICULTY_NAMES[d], ids.ACT_NAMES[act], "Quests"):
                    groups[group].add(name)
        for i in range(ids.WAYPOINTS):
            name = ids.waypoint_location_name(d, i)
            for group in (ids.DIFFICULTY_NAMES[d], ids.ACT_NAMES[ids.waypoint_act(i)], "Waypoints"):
                groups[group].add(name)
        for i in range(ids.AREAS):
            name = ids.area_location_name(d, i)
            for group in (ids.DIFFICULTY_NAMES[d], ids.ACT_NAMES[ids.area_act(i)], "Areas"):
                groups[group].add(name)
    for clvl in range(ids.LEVEL_MIN, ids.LEVEL_MAX + 1):
        groups["Level Milestones"].add(ids.level_location_name(clvl))
    return groups


class D2RRWorld(World):
    """Diablo II: Resurrected with every skill shuffled across all eight classes. Skill
    points come from the multiworld; you choose where each one goes."""

    game = "D2R Randomizer"
    options_dataclass = D2RROptions
    options: D2RROptions
    web = D2RRWeb()
    topology_present = True

    item_name_to_id = ids.all_item_names()
    location_name_to_id = ids.all_location_names()

    item_name_groups = {
        "Skill Points": {ids.SKILL_POINT_ITEM},
        "Keys": {ids.HORADRIC_KEY_ITEM},
        "Runes": {ids.rune_item_name(i) for i in range(len(ids.RUNE_NAMES))},
        "Traps": set(ids.TRAP_ITEMS),
    }
    location_name_groups = _location_groups()

    def __init__(self, multiworld, player: int):
        super().__init__(multiworld, player)
        self.class_code = "pal"
        self.d2rr_seed = 0
        self.goal_difficulty = 0
        self.goal_act = ids.BAAL_ACT
        # Counts for every kind of item, fitted to the locations that exist.
        self.pool: Dict[str, int] = {"skill_points": 110}

    def generate_early(self) -> None:
        self.class_code = ids.CLASSES[self.options.character_class.value]
        self.goal_difficulty = self.options.goal_difficulty.value
        self.goal_act = self.options.goal_boss.value

        # The seed is chosen HERE, not by the player: it must be reproducible from the
        # multiworld, and the client asks d2rrandomizer.com for exactly this mod.
        self.d2rr_seed = self.random.randint(1, 2_000_000_000)

        pooled_stats = self.options.stat_points.value == self.options.stat_points.option_pooled
        self.pool = ids.resolve_pool(
            len(self._active_location_names()),
            skill_points=self.options.skill_points.value,
            starting_skill_points=self.options.starting_skill_points.value,
            keys=ids.keys_in_pool(bool(self.options.key_items), self.goal_difficulty, self.goal_act),
            # One bundle for each level-up the goal expects.
            stat_bundles=ids.level_cap(self.goal_difficulty, self.goal_act) - 1 if pooled_stats else 0,
            trap_percentage=self.options.trap_percentage.value,
            rune_percentage=self.options.rune_percentage.value,
        )

    def _active_location_names(self) -> List[str]:
        return ids.active_location_names(
            self.goal_difficulty,
            bool(self.options.include_waypoints),
            bool(self.options.include_areas),
            bool(self.options.include_level_milestones),
            self.goal_act,
        )

    # ------------------------------------------------------------------ regions

    def _region_name(self, difficulty: int, act: int, gate: Optional[str] = None) -> str:
        if gate == ids.TAL_RASHA:
            return f"{ids.DIFFICULTY_NAMES[difficulty]} Tal Rasha's Chamber"
        if gate == ids.DURANCE:
            return f"{ids.DIFFICULTY_NAMES[difficulty]} Durance of Hate"
        return f"{ids.DIFFICULTY_NAMES[difficulty]} {ids.ACT_NAMES[act]}"

    def create_regions(self) -> None:
        """One region per act of each difficulty, in the order the game plays them, with
        the two Cube-gated lairs as regions of their own:

            Act I -> Act II -> Tal Rasha's Chamber -> Act III -> Durance of Hate
                  -> Act IV -> Act V -> (next difficulty's Act I)
        """
        active = set(self._active_location_names())
        regions: Dict[str, Region] = {}

        def region(name: str) -> Region:
            if name not in regions:
                regions[name] = Region(name, self.player, self.multiworld)
                self.multiworld.regions.append(regions[name])
            return regions[name]

        def place(region_name: str, name: str, location_id: Optional[int]) -> None:
            if name in active:
                target = region(region_name)
                target.locations.append(D2RRLocation(self.player, name, location_id, target))

        previous = region("Menu")
        for d in range(self.goal_difficulty + 1):
            for act in range(ids.acts_in(d, self.goal_difficulty, self.goal_act)):
                here = region(self._region_name(d, act))
                previous.connect(here, None, rules.can_enter_act(self, d, act))
                previous = here

                # Act II and Act III each end in a lair behind a Cube recipe; the next
                # act hangs off the lair, not off the act.
                gate = {1: ids.TAL_RASHA, 2: ids.DURANCE}.get(act)
                if gate:
                    lair = region(self._region_name(d, act, gate))
                    here.connect(lair, None, rules.can_open_gate(self, gate))
                    previous = lair

                for i in range(ids.QUESTS_PER_ACT[act]):
                    place(self._region_name(d, act, ids.quest_gate(act, i)),
                          ids.quest_location_name(d, act, i), ids.quest_location_id(d, act, i))
                for i in ids.waypoints_for_act(act):
                    place(self._region_name(d, act, ids.waypoint_gate(i)),
                          ids.waypoint_location_name(d, i), ids.waypoint_location_id(d, i))
                for i in range(ids.AREAS):
                    if ids.area_act(i) == act:
                        place(self._region_name(d, act, ids.area_gate(i)),
                              ids.area_location_name(d, i), ids.area_location_id(d, i))

                # A locked event marks the boss's death. The next difficulty and the goal
                # both read it, which keeps those rules to a state.has() lookup.
                is_goal = d == self.goal_difficulty and act == self.goal_act
                if act == ids.BAAL_ACT or is_goal:
                    boss_region = region(self._region_name(d, act, ids.quest_gate(act, ids.GOAL_QUEST_INDEX[act])))
                    event = rules.boss_event_name(act, d)
                    location = D2RRLocation(self.player, event, None, boss_region)
                    location.place_locked_item(
                        D2RRItem(event, ItemClassification.progression, None, self.player))
                    boss_region.locations.append(location)

        for clvl in range(ids.LEVEL_MIN, ids.LEVEL_MAX + 1):
            home = ids.level_milestone_region(clvl, self.goal_difficulty, self.goal_act)
            if home:
                place(self._region_name(*home), ids.level_location_name(clvl), ids.level_location_id(clvl))

    # -------------------------------------------------------------------- items

    def create_item(self, name: str) -> D2RRItem:
        if name == ids.SKILL_POINT_ITEM:
            classification = SKILL_POINT_CLASSIFICATION
        elif name == ids.HORADRIC_KEY_ITEM:
            classification = ItemClassification.progression
        elif name in ids.TRAP_ITEMS:
            classification = ItemClassification.trap
        elif name == ids.STAT_POINTS_ITEM or name in self._useful_runes:
            classification = ItemClassification.useful
        else:
            classification = ItemClassification.filler
        return D2RRItem(name, classification, self.item_name_to_id[name], self.player)

    _useful_runes = frozenset(
        ids.rune_item_name(i) for i in range(ids.FIRST_USEFUL_RUNE, len(ids.RUNE_NAMES)))

    def get_filler_item_name(self) -> str:
        return ids.TRAINING_FRAGMENT_ITEM

    def _random_rune(self) -> str:
        """Low runes are common and high runes rare, as in the game, and a goal never
        hands out a rune the difficulty it ends on could not drop."""
        cap = ids.RUNE_CAP_BY_DIFFICULTY[self.goal_difficulty]
        weights = [1.0 / (i + 1) ** 1.3 for i in range(cap)]
        return ids.rune_item_name(self.random.choices(range(cap), weights)[0])

    def create_items(self) -> None:
        pool = self.pool
        for _ in range(pool["starting_skill_points"]):
            self.multiworld.push_precollected(self.create_item(ids.SKILL_POINT_ITEM))

        names: List[str] = (
            [ids.SKILL_POINT_ITEM] * pool["placed_skill_points"]
            + [ids.HORADRIC_KEY_ITEM] * pool["keys"]
            + [ids.STAT_POINTS_ITEM] * pool["stat_bundles"]
            + [self.random.choice(ids.TRAP_ITEMS) for _ in range(pool["traps"])]
            + [self._random_rune() for _ in range(pool["runes"])]
            + [ids.GOLD_ITEM] * pool["gold"]
            + [ids.TRAINING_FRAGMENT_ITEM] * pool["fragments"]
        )
        self.multiworld.itempool += [self.create_item(name) for name in names]

    def set_rules(self) -> None:
        rules.set_completion(self)

    def fill_slot_data(self) -> Dict[str, Any]:
        """Everything the companion client needs to fetch the right mod and run the slot."""
        return {
            "contract_version": SLOT_CONTRACT_VERSION,
            "d2rr_seed": self.d2rr_seed,
            "character_class": self.class_code,
            # A folder of its own per slot, so a player can hold several without their
            # characters mixing, and two worlds that drew the same seed stay apart.
            "savepath": f"ap_{self.d2rr_seed}_{self.class_code}_" + hashlib.sha256(
                f"{self.multiworld.seed_name}/{self.player}".encode()).hexdigest()[:12],
            "goal_difficulty": self.goal_difficulty,
            "goal_act": self.goal_act,
            "goal_quest": ids.GOAL_QUEST_INDEX[self.goal_act],
            "level_cap": ids.level_cap(self.goal_difficulty, self.goal_act),
            "include_waypoints": bool(self.options.include_waypoints),
            "include_areas": bool(self.options.include_areas),
            "include_level_milestones": bool(self.options.include_level_milestones),
            "skill_points": self.pool["skill_points"],
            "starting_skill_points": self.pool["starting_skill_points"],
            "fragments_per_point": ids.FRAGMENTS_PER_POINT,
            "stat_points_pooled": self.pool["stat_bundles"] > 0,
            "stat_points_per_item": ids.STAT_POINTS_PER_ITEM,
            "horadric_keys": self.pool["keys"],
            "death_link": bool(self.options.death_link),
            # Passed straight through to /api/archipelago/mod.
            "mod_options": {
                "keyItems": self.pool["keys"] > 0,
                "xpMultiplier": self.options.xp_multiplier.value,
                "monsterShuffle": bool(self.options.monster_shuffle),
            },
        }
