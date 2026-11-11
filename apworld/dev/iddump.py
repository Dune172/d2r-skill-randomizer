"""Print the apworld's id tables as JSON, for the Go/Python cross-check.

Loads only ids.py (see _load.py), so it runs without Archipelago installed.

    python apworld/dev/iddump.py
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from _load import load_ids  # noqa: E402

ids = load_ids()


def main() -> None:
    locations = {}
    for d in range(ids.DIFFICULTIES):
        for act, count in enumerate(ids.QUESTS_PER_ACT):
            for i in range(count):
                locations[f"q:{d}:{act}:{i}"] = ids.quest_location_id(d, act, i)
        for i in range(ids.WAYPOINTS):
            locations[f"wp:{d}:{i}"] = ids.waypoint_location_id(d, i)
        for i in range(ids.AREAS):
            locations[f"area:{d}:{i}"] = ids.area_location_id(d, i)
    for clvl in range(ids.LEVEL_MIN, ids.LEVEL_MAX + 1):
        locations[f"lvl:{clvl}"] = ids.level_location_id(clvl)

    # How many checks a slot holds for every goal and check toggle, so the page's port of
    # active_location_names (src/lib/archipelago/checks.ts) can be held to it.
    active_counts = {}
    for gd in range(ids.DIFFICULTIES):
        for ga in range(ids.ACTS):
            for w in (0, 1):
                for a in (0, 1):
                    for lv in (0, 1):
                        names = ids.active_location_names(gd, bool(w), bool(a), bool(lv), ga)
                        active_counts[f"{gd}:{ga}:{w}:{a}:{lv}"] = len(names)

    print(json.dumps({
        "itemBase": ids.ITEM_BASE,
        "locationBase": ids.LOCATION_BASE,
        "classes": ids.CLASSES,
        "questsPerAct": ids.QUESTS_PER_ACT,
        "questsTotal": ids.quests_total(),
        "locationsTotal": ids.locations_total(),
        "areas": ids.AREAS,
        "levelMin": ids.LEVEL_MIN,
        "levelMax": ids.LEVEL_MAX,
        "levelCaps": ids.LEVEL_CAPS,
        "goalQuestIndex": ids.GOAL_QUEST_INDEX,
        "fragmentsPerPoint": ids.FRAGMENTS_PER_POINT,
        "statPointsPerItem": ids.STAT_POINTS_PER_ITEM,
        "keysForHoradricStaff": ids.KEYS_FOR_HORADRIC_STAFF,
        "keysForKhalimsWill": ids.KEYS_FOR_KHALIMS_WILL,
        # The generated area tables are dumped in full, not just their length: a
        # transcription difference between the Python and Go copies would otherwise
        # only show up as a player entering an area and checking the wrong location.
        "areaLevelIds": list(ids.AREA_LEVEL_IDS),
        "areaLabels": list(ids.AREA_LABELS),
        "areaActs": list(ids.AREA_ACTS),
        "items": ids.all_item_names(),
        "traps": ids.TRAP_ITEMS,
        "runes": [ids.rune_item_name(i) for i in range(len(ids.RUNE_NAMES))],
        "locations": locations,
        "activeCounts": active_counts,
        "locationNames": {str(i): name for name, i in ids.all_location_names().items()},
    }, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
