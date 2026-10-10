from .. import ids, rules
from . import D2RRTestBase

EVERYTHING = {"key_items": True, "stat_points": "pooled", "rune_percentage": 40, "trap_percentage": 15}


class TestDefaults(D2RRTestBase):
    def test_pool_fills_the_locations_exactly(self) -> None:
        unfilled = [loc for loc in self.multiworld.get_locations(self.player) if loc.address is not None]
        self.assertEqual(len(self.multiworld.itempool), len(unfilled))

    def test_goal_needs_baal(self) -> None:
        self.assertBeatable(False)
        self.collect_all_but([rules.boss_event_name(ids.BAAL_ACT, 0)])
        self.assertBeatable(False)


class TestSkillPointGates(D2RRTestBase):
    options = {"goal_boss": "baal", "skill_points": 100, "starting_skill_points": 0, "logic_difficulty": "strict"}

    def test_each_act_asks_for_more_points_than_the_last(self) -> None:
        needs = [rules.skill_points_needed(self.world, 0, act) for act in range(ids.ACTS)]
        self.assertEqual(needs[0], 0)
        self.assertEqual(needs, sorted(needs))
        self.assertGreater(needs[-1], needs[1])
        self.assertLess(needs[-1], self.world.pool["skill_points"])

    def test_act_two_waits_for_its_points(self) -> None:
        need = rules.skill_points_needed(self.world, 0, 1)
        self.assertGreater(need, 0)
        location = ids.quest_location_name(0, 1, 0)  # Radament's Lair
        self.assertFalse(self.can_reach_location(location))
        points = self.get_items_by_name(ids.SKILL_POINT_ITEM)
        self.collect(points[:need - 1])
        self.assertFalse(self.can_reach_location(location))
        self.collect(points[need - 1:need])
        self.assertTrue(self.can_reach_location(location))


class TestKeyGates(D2RRTestBase):
    options = {"key_items": True, "goal_boss": "baal"}

    def test_five_keys_are_in_the_pool(self) -> None:
        self.assertEqual(len(self.get_items_by_name(ids.HORADRIC_KEY_ITEM)), ids.KEYS_FOR_KHALIMS_WILL)

    def test_duriel_needs_two_keys_and_mephisto_five(self) -> None:
        duriel = ids.quest_location_name(0, 1, 5)
        mephisto = ids.quest_location_name(0, 2, 5)
        travincal = ids.quest_location_name(0, 2, 4)  # The Blackened Temple: before the Durance
        keys = self.get_items_by_name(ids.HORADRIC_KEY_ITEM)
        self.collect(self.get_items_by_name(ids.SKILL_POINT_ITEM))

        self.assertFalse(self.can_reach_location(duriel))
        self.collect(keys[:1])
        self.assertFalse(self.can_reach_location(duriel))
        self.collect(keys[1:2])
        self.assertTrue(self.can_reach_location(duriel))
        self.assertTrue(self.can_reach_location(travincal))
        self.assertFalse(self.can_reach_location(mephisto))
        self.collect(keys[2:4])
        self.assertFalse(self.can_reach_location(mephisto))
        self.collect(keys[4:])
        self.assertTrue(self.can_reach_location(mephisto))

    def test_act_four_is_behind_the_durance(self) -> None:
        self.assertAccessDependency(
            [ids.quest_location_name(0, 3, 0)], [[ids.HORADRIC_KEY_ITEM]], only_check_listed=True)


class TestShortGoalCarriesOnlyTheKeysItNeeds(D2RRTestBase):
    options = {"key_items": True, "goal_boss": "duriel"}

    def test_two_keys(self) -> None:
        self.assertEqual(len(self.get_items_by_name(ids.HORADRIC_KEY_ITEM)), ids.KEYS_FOR_HORADRIC_STAFF)


class TestAndarielGoal(D2RRTestBase):
    options = {"goal_boss": "andariel", **EVERYTHING}

    def test_nothing_past_act_one(self) -> None:
        for location in self.multiworld.get_locations(self.player):
            self.assertNotIn(" A2: ", location.name)
        self.assertEqual(self.get_items_by_name(ids.HORADRIC_KEY_ITEM), [])


class TestQuestsOnlyWithEverything(D2RRTestBase):
    options = {"include_waypoints": False, "include_areas": False, "include_level_milestones": False,
               "skill_points": 600, **EVERYTHING}


class TestHellEverything(D2RRTestBase):
    options = {"goal_difficulty": "hell", "skill_points": 600, "logic_difficulty": "strict", **EVERYTHING}


class TestNightmareDiablo(D2RRTestBase):
    options = {"goal_difficulty": "nightmare", "goal_boss": "diablo", "starting_skill_points": 5}

    def test_normal_is_played_in_full_first(self) -> None:
        names = {location.name for location in self.multiworld.get_locations(self.player)}
        self.assertIn(rules.boss_event_name(ids.BAAL_ACT, 0), names)
        self.assertIn(rules.boss_event_name(3, 1), names)
        self.assertNotIn(ids.quest_location_name(1, 4, 0), names)
