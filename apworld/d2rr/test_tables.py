"""Standalone tests for the apworld's pure tables and pool sizing.

Runs WITHOUT Archipelago installed, by importing only ids.py. That matters: the failures
these catch (more items than locations, waypoint ranges that skip or double an index,
locations past the goal) all surface inside Archipelago's fill as an opaque generation
error, long after the actual mistake.

    python apworld/d2rr/test_tables.py
"""

import itertools
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import ids  # noqa: E402

GOALS = [(d, act) for d in range(ids.DIFFICULTIES) for act in range(ids.ACTS)]
CHECK_GROUPS = list(itertools.product([False, True], repeat=3))


def locations(goal, groups=(True, True, True)):
    d, act = goal
    wp, areas, levels = groups
    return ids.active_location_names(d, wp, areas, levels, act)


class TestIdsAreFrozen(unittest.TestCase):
    """Ids are immutable once a multiworld exists. These anchors are what make "append,
    never renumber" enforceable rather than a convention someone remembers."""

    def test_location_group_boundaries_have_not_moved(self):
        base = ids.LOCATION_BASE
        self.assertEqual(ids.quest_location_id(0, 0, 0), base + 0)
        self.assertEqual(ids.waypoint_location_id(0, 0), base + 81)
        self.assertEqual(ids.area_location_id(0, 0), base + 198)
        self.assertEqual(ids.level_location_id(ids.LEVEL_MIN), base + 609)
        self.assertEqual(ids.locations_total(), 707)

    def test_item_ids_have_not_moved(self):
        items = ids.all_item_names()
        base = ids.ITEM_BASE
        self.assertEqual(items["Progressive Skill Point"], base + 2000)
        self.assertEqual(items["Training Fragment"], base + 2001)
        self.assertEqual(items["Stat Points"], base + 2002)
        self.assertEqual(items["Progressive Horadric Key"], base + 2003)
        self.assertEqual(items["Gold"], base + 2004)
        self.assertEqual(items["Mana Burn Trap"], base + 2010)
        self.assertEqual(items["Gold Tax Trap"], base + 2014)
        self.assertEqual(items["El Rune"], base + 2100)
        self.assertEqual(items["Zod Rune"], base + 2132)

    def test_ids_and_names_are_unique(self):
        for table in (ids.all_item_names(), ids.all_location_names()):
            self.assertEqual(len(set(table.values())), len(table))
            self.assertNotIn(None, table.values())
        self.assertEqual(len(ids.all_location_names()), ids.locations_total())

    def test_item_and_location_ids_do_not_overlap(self):
        # Archipelago allows it, but a shared number in a log line is needlessly ambiguous.
        self.assertFalse(set(ids.all_item_names().values()) & set(ids.all_location_names().values()))


class TestWaypointsAndAreas(unittest.TestCase):
    def test_act_ranges_cover_every_waypoint_exactly_once(self):
        seen = [i for act in range(ids.ACTS) for i in ids.waypoints_for_act(act)]
        self.assertEqual(seen, list(range(ids.WAYPOINTS)))
        self.assertEqual([ids.waypoint_act(i) for i in (0, 8, 9, 26, 27, 29, 30, 38)],
                         [0, 0, 1, 2, 3, 3, 4, 4])

    def test_act_four_is_the_short_one(self):
        self.assertEqual(len(ids.waypoints_for_act(3)), 3)
        self.assertEqual(ids.QUESTS_PER_ACT[3], 3)

    def test_every_quest_and_waypoint_has_a_name(self):
        self.assertEqual([len(q) for q in ids.QUEST_NAMES], ids.QUESTS_PER_ACT)
        self.assertEqual(len(ids.WAYPOINT_NAMES), ids.WAYPOINTS)

    def test_area_tables_agree(self):
        self.assertEqual(len(ids.AREA_LABELS), ids.AREAS)
        self.assertEqual(len(ids.AREA_ACTS), ids.AREAS)
        self.assertEqual(len(set(ids.AREA_LABELS)), ids.AREAS)
        self.assertTrue(all(0 <= a < ids.ACTS for a in ids.AREA_ACTS))
        for index, level_id in enumerate(ids.AREA_LEVEL_IDS):
            self.assertEqual(ids.area_index_for_level_id(level_id), index)


class TestGoals(unittest.TestCase):
    def test_each_boss_dies_in_the_quest_named_for_it(self):
        names = [ids.QUEST_NAMES[act][ids.GOAL_QUEST_INDEX[act]] for act in range(ids.ACTS)]
        self.assertEqual(names, ["Sisters to the Slaughter", "The Seven Tombs", "The Guardian",
                                 "Terror's End", "Eve of Destruction"])

    def test_the_goal_quest_is_always_a_location(self):
        for d, act in GOALS:
            for groups in CHECK_GROUPS:
                goal = ids.quest_location_name(d, act, ids.GOAL_QUEST_INDEX[act])
                self.assertIn(goal, locations((d, act), groups))

    def test_nothing_past_the_goal_is_a_location(self):
        for d, act in GOALS:
            names = set(locations((d, act)))
            for later_d in range(ids.DIFFICULTIES):
                for later_act in range(ids.ACTS):
                    past = later_d > d or (later_d == d and later_act > act)
                    quest = ids.quest_location_name(later_d, later_act, 0)
                    self.assertEqual(quest in names, not past, (d, act, later_d, later_act))
                    for wp in ids.waypoints_for_act(later_act):
                        self.assertEqual(ids.waypoint_location_name(later_d, wp) in names, not past)
            for index in range(ids.AREAS):
                for area_d in range(ids.DIFFICULTIES):
                    past = area_d > d or (area_d == d and ids.area_act(index) > act)
                    self.assertEqual(ids.area_location_name(area_d, index) in names, not past)

    def test_a_longer_goal_never_has_fewer_locations(self):
        counts = [len(locations(goal)) for goal in GOALS]
        self.assertEqual(counts, sorted(counts))
        self.assertEqual(len(set(counts)), len(counts))

    def test_check_groups_switch_off_independently(self):
        for goal in GOALS:
            full = set(locations(goal))
            for groups in CHECK_GROUPS:
                names = locations(goal, groups)
                self.assertEqual(len(names), len(set(names)))
                self.assertTrue(set(names) <= full)
                wp, areas, levels = groups
                self.assertEqual(any(" WP: " in n for n in names), wp)
                self.assertEqual(any(" Area: " in n for n in names), areas)
                self.assertEqual(any(n.startswith("Level ") for n in names), levels)

    def test_level_caps_rise_through_the_game(self):
        flat = [cap for row in ids.LEVEL_CAPS for cap in row]
        self.assertEqual(flat, sorted(flat))
        self.assertEqual(len(set(flat)), len(flat))

    def test_every_active_level_sits_in_an_act_the_goal_reaches(self):
        for d, act in GOALS:
            for clvl in range(ids.LEVEL_MIN, ids.LEVEL_MAX + 1):
                home = ids.level_milestone_region(clvl, d, act)
                if clvl > ids.level_cap(d, act):
                    self.assertIsNone(home)
                    continue
                self.assertIsNotNone(home, (d, act, clvl))
                self.assertLess(home[1], ids.acts_in(home[0], d, act))


class TestGates(unittest.TestCase):
    def test_gated_locations_are_the_ones_behind_a_cube_recipe(self):
        gated = {ids.QUEST_NAMES[act][i]: ids.quest_gate(act, i)
                 for act in range(ids.ACTS) for i in range(ids.QUESTS_PER_ACT[act])
                 if ids.quest_gate(act, i)}
        self.assertEqual(gated, {
            "The Horadric Staff": ids.TAL_RASHA, "The Seven Tombs": ids.TAL_RASHA,
            "Khalim's Will": ids.DURANCE, "The Guardian": ids.DURANCE,
        })
        self.assertEqual({ids.WAYPOINT_NAMES[i] for i in range(ids.WAYPOINTS) if ids.waypoint_gate(i)},
                         {"Durance of Hate Level 2"})
        self.assertEqual({ids.AREA_LABELS[i]: ids.area_gate(i) for i in range(ids.AREAS) if ids.area_gate(i)}, {
            "Duriel's Lair": ids.TAL_RASHA,
            "Durance of Hate Level 1": ids.DURANCE,
            "Durance of Hate Level 2": ids.DURANCE,
            "Durance of Hate Level 3": ids.DURANCE,
        })

    def test_gated_areas_and_quests_sit_in_the_right_act(self):
        for i in range(ids.AREAS):
            if ids.area_gate(i):
                self.assertEqual(ids.area_act(i), 1 if ids.area_gate(i) == ids.TAL_RASHA else 2)

    def test_a_goal_only_carries_the_keys_it_needs(self):
        self.assertEqual(ids.keys_in_pool(False, 2, 4), 0)
        self.assertEqual(ids.keys_in_pool(True, 0, 0), 0)   # Andariel: no locked recipe in reach
        self.assertEqual(ids.keys_in_pool(True, 0, 1), 2)   # Duriel: the staff
        self.assertEqual(ids.keys_in_pool(True, 0, 2), 5)   # Mephisto: the staff, then the flail
        self.assertEqual(ids.keys_in_pool(True, 0, 4), 5)
        self.assertEqual(ids.keys_in_pool(True, 1, 0), 5)   # all of Normal came first


class TestPoolSizing(unittest.TestCase):
    REQUESTS = [
        dict(skill_points=sp, starting_skill_points=start, keys=keys, stat_bundles=stats,
             trap_percentage=traps, rune_percentage=runes)
        for sp in (20, 110, 600)
        for start in (0, 5)
        for keys in (0, 2, 5)
        for stats in (0, 29, 74)
        for traps in (0, 10, 100)
        for runes in (0, 30, 100)
    ]

    def sizes(self):
        return sorted({len(locations(goal, groups)) for goal in GOALS for groups in CHECK_GROUPS} | {1, 2, 3})

    def test_the_pool_always_fills_the_locations_exactly(self):
        for count in self.sizes():
            for request in self.REQUESTS:
                pool = ids.resolve_pool(count, **request)
                placed = (pool["keys"] + pool["placed_skill_points"] + pool["stat_bundles"]
                          + pool["traps"] + pool["runes"] + pool["gold"] + pool["fragments"])
                self.assertEqual(placed, count, (count, request, pool))
                self.assertTrue(all(v >= 0 for v in pool.values()), (count, request, pool))

    def test_there_is_always_at_least_one_skill_point(self):
        for count in self.sizes():
            for request in self.REQUESTS:
                self.assertGreaterEqual(ids.resolve_pool(count, **request)["skill_points"], 1)

    def test_skill_points_never_exceed_what_a_character_can_spend(self):
        pool = ids.resolve_pool(5000, skill_points=600)
        self.assertEqual(pool["skill_points"], ids.MAX_SKILL_POINTS)

    def test_progression_stays_under_the_density_cap(self):
        for count in self.sizes():
            if count < 10:
                continue  # with a handful of locations the one guaranteed point dominates
            for request in self.REQUESTS:
                pool = ids.resolve_pool(count, **request)
                progression = pool["keys"] + pool["placed_skill_points"]
                self.assertLessEqual(progression, max(pool["keys"] + 1, int(count * ids.PROGRESSION_DENSITY_CAP)),
                                     (count, request, pool))

    def test_keys_are_never_trimmed_when_they_fit(self):
        for count in self.sizes():
            for keys in (2, 5):
                pool = ids.resolve_pool(count, skill_points=110, keys=keys)
                self.assertEqual(pool["keys"], min(keys, count - 1))

    def test_starting_points_come_out_of_the_total(self):
        pool = ids.resolve_pool(400, skill_points=110, starting_skill_points=5)
        self.assertEqual(pool["skill_points"], 110)
        self.assertEqual(pool["placed_skill_points"], 105)
        self.assertEqual(pool["starting_skill_points"], 5)

    def test_a_default_request_fits_every_baal_goal(self):
        for d in range(ids.DIFFICULTIES):
            pool = ids.resolve_pool(len(locations((d, ids.BAAL_ACT))), skill_points=110, starting_skill_points=1)
            self.assertEqual(pool["skill_points"], 110)

    def test_percentages_split_the_filler(self):
        pool = ids.resolve_pool(300, skill_points=100, trap_percentage=10, rune_percentage=50)
        filler = 300 - 100
        self.assertEqual(pool["traps"], filler * 10 // 100)
        self.assertEqual(pool["runes"], (filler - pool["traps"]) * 50 // 100)
        everything = ids.resolve_pool(300, skill_points=100, trap_percentage=100, rune_percentage=100)
        self.assertEqual((everything["traps"], everything["runes"], everything["gold"], everything["fragments"]),
                         (filler, 0, 0, 0))

    def test_rune_caps_are_real_runes(self):
        self.assertEqual([ids.RUNE_NAMES[cap - 1] for cap in ids.RUNE_CAP_BY_DIFFICULTY], ["Hel", "Ist", "Zod"])
        self.assertEqual(ids.RUNE_NAMES[ids.FIRST_USEFUL_RUNE], "Lem")
        self.assertEqual(len(ids.RUNE_NAMES), 33)


if __name__ == "__main__":
    unittest.main(verbosity=1)
