"""Archipelago's own world tests, run from an Archipelago source checkout:

    pytest worlds/d2rr/test

Every class below also inherits WorldTestBase's generic checks: that everything is
reachable with every item, that something is reachable with none, and that the world
fills. apworld/dev/test_tables.py covers the tables without needing Archipelago.
"""

from test.bases import WorldTestBase


class D2RRTestBase(WorldTestBase):
    game = "D2R Randomizer"
