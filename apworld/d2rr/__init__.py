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
import logging

from typing import Any

from BaseClasses import Item, ItemClassification, Location, Region, Tutorial
from worlds.AutoWorld import WebWorld, World

from . import ids, rules
from .options import OPTION_GROUPS, OPTION_PRESETS, D2RROptions

# Bumped when slot_data changes in a way the client must understand.
SLOT_CONTRACT_VERSION = 6

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
    bug_report_page = "https://github.com/Dune172/d2r-skill-randomizer/issues"
    tutorials = [Tutorial(
        "Multiworld Setup Guide",
        "A guide to playing D2R Randomizer with Archipelago.",
        "English",
        "setup_en.md",
        "setup/en",
        ["swannysoft"],
    )]


def _location_groups() -> dict[str, set]:
    groups: dict[str, set] = {name: set() for name in ids.DIFFICULTY_NAMES + ids.ACT_NAMES}
    groups.update({"Quests": set(), "Waypoints": set(), "Areas": set(), "Level Milestones": set(),
                   "Super-Unique Kills": set()})
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
    for d in range(ids.DIFFICULTIES):
        for i, (_, act) in enumerate(ids.SUPER_UNIQUES):
            name = ids.kill_location_name(d, i)
            for group in (ids.DIFFICULTY_NAMES[d], ids.ACT_NAMES[act], "Super-Unique Kills"):
                groups[group].add(name)
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
        "Traps": set(ids.TRAP_ITEMS),
        "Filler": {ids.GOLD_ITEM},
    }

    # Universal Tracker rebuilds a slot from its slot_data, without the player's YAML.
    ut_can_gen_without_yaml = True
    # The rune items and Training Fragments keep their names and ids (ids.py) but are never
    # placed, so they have no group: a hint for one could never succeed.
    location_name_groups = _location_groups()

    def __init__(self, multiworld, player: int):
        super().__init__(multiworld, player)
        self.class_code = "pal"
        self.d2rr_seed = 0
        self.goal_difficulty = 0
        self.goal_act = ids.BAAL_ACT
        # Counts for every kind of item, fitted to the locations that exist.
        self.pool: dict[str, int] = {"skill_points": 110}

    def generate_early(self) -> None:
        tracked = getattr(self.multiworld, "re_gen_passthrough", {}).get(self.game)
        if tracked:
            self.use_tracker_slot_data(tracked)

        self.class_code = ids.CLASSES[self.options.character_class.value]
        self.goal_difficulty = self.options.goal_difficulty.value
        self.goal_act = self.options.goal_boss.value
        # These goals need every act of the goal difficulty, whatever Goal Boss says.
        goal_type = self.options.goal_type
        if goal_type.value in (goal_type.option_all_bosses, goal_type.option_cow_king):
            self.goal_act = ids.BAAL_ACT

        # The seed is chosen HERE, not by the player: it must be reproducible from the
        # multiworld, and the client asks d2rrandomizer.com for exactly this mod.
        self.d2rr_seed = tracked["d2rr_seed"] if tracked else self.random.randint(1, 2_000_000_000)

        pooled_stats = self.options.stat_points.value == self.options.stat_points.option_pooled
        self.pool = ids.resolve_pool(
            len(self._active_location_names()),
            skill_points=self.options.skill_points.value,
            starting_skill_points=self.options.starting_skill_points.value,
            keys=ids.keys_in_pool(bool(self.options.key_items), self.goal_difficulty, self.goal_act),
            # One bundle for each level-up the goal expects.
            stat_bundles=ids.level_cap(self.goal_difficulty, self.goal_act) - 1 if pooled_stats else 0,
            trap_percentage=self.options.trap_percentage.value,
        )
        asked = self.options.skill_points.value
        if self.pool["skill_points"] < asked and not tracked:
            logging.warning(
                "D2R Randomizer: %s asked for %d skill points, but only %d fit in this slot's "
                "locations (or a character can spend); generating with %d.",
                self.player_name, asked, self.pool["skill_points"], self.pool["skill_points"])

    @staticmethod
    def interpret_slot_data(slot_data: dict[str, Any]) -> dict[str, Any]:
        """Universal Tracker hands this back as re_gen_passthrough when it regenerates."""
        return slot_data

    def use_tracker_slot_data(self, slot_data: dict[str, Any]) -> None:
        """Set the options that shape regions and rules from a room's slot_data, so a
        tracker's regeneration has the same locations and logic as the room."""
        options = self.options
        options.character_class.value = ids.CLASSES.index(slot_data["character_class"])
        options.goal_difficulty.value = slot_data["goal_difficulty"]
        options.goal_boss.value = slot_data["goal_act"]
        options.skill_points.value = slot_data["skill_points"]
        options.starting_skill_points.value = slot_data["starting_skill_points"]
        options.include_waypoints.value = int(slot_data["include_waypoints"])
        options.include_areas.value = int(slot_data["include_areas"])
        options.include_level_milestones.value = int(slot_data["include_level_milestones"])
        options.key_items.value = int(slot_data["horadric_keys"] > 0)
        options.stat_points.value = (options.stat_points.option_pooled if slot_data["stat_points_pooled"]
                                     else options.stat_points.option_vanilla)
        options.open_acts.value = int(slot_data.get("open_acts", False))
        if "logic_difficulty" in slot_data:
            options.logic_difficulty.value = slot_data["logic_difficulty"]
        options.include_super_uniques.value = int(slot_data.get("include_super_uniques", False))
        options.goal_type.value = slot_data.get("goal_type", options.goal_type.option_boss)
        options.goal_check_percentage.value = slot_data.get("goal_check_percentage", options.goal_check_percentage.default)

    def _active_location_names(self) -> list[str]:
        return ids.active_location_names(
            self.goal_difficulty,
            bool(self.options.include_waypoints),
            bool(self.options.include_areas),
            bool(self.options.include_level_milestones),
            self.goal_act,
            bool(self.options.include_super_uniques),
        )

    # ------------------------------------------------------------------ regions

    def goal_region_name(self) -> str:
        """The region holding the goal act's boss quest on the goal difficulty."""
        gate = ids.quest_gate(self.goal_act, ids.GOAL_QUEST_INDEX[self.goal_act])
        return self._region_name(self.goal_difficulty, self.goal_act, gate)

    def _region_name(self, difficulty: int, act: int, gate: str | None = None) -> str:
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
        regions: dict[str, Region] = {}

        def region(name: str) -> Region:
            if name not in regions:
                regions[name] = Region(name, self.player, self.multiworld)
                self.multiworld.regions.append(regions[name])
            return regions[name]

        def place(region_name: str, name: str, location_id: int | None) -> None:
            if name in active:
                target = region(region_name)
                target.locations.append(D2RRLocation(self.player, name, location_id, target))

        # Open Acts: Acts II and III are entered from Act I of the same difficulty, not
        # each from the end of the act before. Act IV still follows Mephisto's lair.
        open_acts = bool(self.options.open_acts)
        previous = region("Menu")
        for d in range(self.goal_difficulty + 1):
            act_one: Region | None = None
            for act in range(ids.acts_in(d, self.goal_difficulty, self.goal_act)):
                here = region(self._region_name(d, act))
                source = act_one if open_acts and act in (1, 2) and act_one is not None else previous
                source.connect(here, None, rules.can_enter_act(self, d, act))
                if act == 0:
                    act_one = here
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
                # No super-unique stands behind a Cube gate, so each hangs off its act.
                for i, (_, su_act) in enumerate(ids.SUPER_UNIQUES):
                    if su_act == act:
                        place(self._region_name(d, act), ids.kill_location_name(d, i), ids.kill_location_id(d, i))

                # A locked event marks the boss's death. The next difficulty and the goal
                # both read it, which keeps those rules to a state.has() lookup.
                # With All Bosses every boss of the goal difficulty is part of the goal.
                is_goal = d == self.goal_difficulty and (
                    act == self.goal_act
                    or self.options.goal_type.value == self.options.goal_type.option_all_bosses)
                if act == ids.BAAL_ACT or is_goal:
                    boss_region = region(self._region_name(d, act, ids.quest_gate(act, ids.GOAL_QUEST_INDEX[act])))
                    event = rules.boss_event_name(act, d)
                    location = D2RRLocation(self.player, event, None, boss_region)
                    location.place_locked_item(
                        D2RRItem(event, ItemClassification.progression, None, self.player))
                    boss_region.locations.append(location)

        # The Cow King: the Cow Level opens from Act I once that difficulty's Baal is dead.
        if self.options.goal_type.value == self.options.goal_type.option_cow_king:
            d = self.goal_difficulty
            baal = rules.boss_event_name(ids.BAAL_ACT, d)
            cow_region = region(f"{ids.DIFFICULTY_NAMES[d]} Moo Moo Farm")
            region(self._region_name(d, 0)).connect(
                cow_region, None, lambda state, baal=baal: state.has(baal, self.player))
            event = rules.cow_king_event_name(d)
            location = D2RRLocation(self.player, event, None, cow_region)
            location.place_locked_item(D2RRItem(event, ItemClassification.progression, None, self.player))
            cow_region.locations.append(location)

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
        elif name == ids.STAT_POINTS_ITEM:
            classification = ItemClassification.useful
        else:
            # Gold, and the reserved names (Training Fragments, runes), which are never placed.
            classification = ItemClassification.filler
        return D2RRItem(name, classification, self.item_name_to_id[name], self.player)

    def get_filler_item_name(self) -> str:
        return ids.GOLD_ITEM

    def create_items(self) -> None:
        pool = self.pool
        for _ in range(pool["starting_skill_points"]):
            self.multiworld.push_precollected(self.create_item(ids.SKILL_POINT_ITEM))

        names: list[str] = (
            [ids.SKILL_POINT_ITEM] * pool["placed_skill_points"]
            + [ids.HORADRIC_KEY_ITEM] * pool["keys"]
            + [ids.STAT_POINTS_ITEM] * pool["stat_bundles"]
            + [self.random.choice(ids.TRAP_ITEMS) for _ in range(pool["traps"])]
            + [ids.GOLD_ITEM] * pool["gold"]
            + [ids.TRAINING_FRAGMENT_ITEM] * pool["fragments"]
        )
        self.multiworld.itempool += [self.create_item(name) for name in names]

    def set_rules(self) -> None:
        rules.set_completion(self)

    def fill_slot_data(self) -> dict[str, Any]:
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
            # boss, all_bosses, check_percentage or cow_king, as the option's value.
            "goal_type": self.options.goal_type.value,
            "goal_check_percentage": self.options.goal_check_percentage.value,
            "level_cap": ids.level_cap(self.goal_difficulty, self.goal_act),
            "include_waypoints": bool(self.options.include_waypoints),
            "include_areas": bool(self.options.include_areas),
            "include_level_milestones": bool(self.options.include_level_milestones),
            "include_super_uniques": bool(self.options.include_super_uniques),
            "skill_points": self.pool["skill_points"],
            "starting_skill_points": self.pool["starting_skill_points"],
            "fragments_per_point": ids.FRAGMENTS_PER_POINT,
            "stat_points_pooled": self.pool["stat_bundles"] > 0,
            "stat_points_per_item": ids.STAT_POINTS_PER_ITEM,
            "horadric_keys": self.pool["keys"],
            "death_link": bool(self.options.death_link),
            "open_acts": bool(self.options.open_acts),
            # For Universal Tracker: the logic a tracker rebuilds must be the room's.
            "logic_difficulty": self.options.logic_difficulty.value,
            # Passed straight through to /api/archipelago/mod.
            "mod_options": {
                "keyItems": self.pool["keys"] > 0,
                "pooledStats": self.pool["stat_bundles"] > 0,
                "xpMultiplier": self.options.xp_multiplier.value,
                "monsterShuffle": bool(self.options.monster_shuffle),
                "openActs": bool(self.options.open_acts),
            },
        }
