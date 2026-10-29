package ids

// Area-discovery and character-level locations.
//
// These APPEND after the 198 quest and waypoint ids rather than interleaving with them,
// so a room generated before they existed still resolves to the same checks. Mirror of
// the same functions in apworld/d2rr/ids.py; scripts/verify-ap-ids.mjs requires exact
// agreement, and nothing else would catch a divergence — the apworld generates offline
// and never talks to this client, so the symptom would be a player receiving the wrong
// item, unfixable forward because ids are immutable once a room exists.

const (
	// LevelMin and LevelMax bound the character-level milestones the id space declares.
	LevelMin = 2
	LevelMax = 99
)

// LevelCaps is roughly the character level on leaving each act, per difficulty. A slot
// only activates milestones up to its goal's figure: a check the player will never
// realistically grind to is not a check, it is somebody else's item stranded behind a
// hundred hours of boss runs.
var LevelCaps = [][]int{
	{12, 18, 24, 27, 30},
	{38, 43, 48, 51, 55},
	{62, 66, 70, 72, 75},
}

// Areas is how many areas carry a check (131).
func Areas() int { return len(AreaLevelIDs) }

// WaypointsTotal is 117: 39 waypoints across 3 difficulties.
func WaypointsTotal() int { return Difficulties * Waypoints }

// AreasTotal is 393: 131 areas across 3 difficulties.
func AreasTotal() int { return Difficulties * Areas() }

// LevelsTotal is 98: character levels 2 through 99.
func LevelsTotal() int { return LevelMax - LevelMin + 1 }

// AreaLocationID maps entering an area on a difficulty to its location id.
//
// index is a position in the frozen area table, NOT the levels.txt Id — use
// AreaIndexForLevelID to convert what the game reports. The two are deliberately
// separate so a levels.txt renumber cannot move a location.
func AreaLocationID(difficulty, index int) (int64, bool) {
	if difficulty < 0 || difficulty >= Difficulties || index < 0 || index >= Areas() {
		return 0, false
	}
	return int64(LocationBase + QuestsTotal() + WaypointsTotal() + difficulty*Areas() + index), true
}

// LevelLocationID maps reaching a character level to its location id.
func LevelLocationID(clvl int) (int64, bool) {
	if clvl < LevelMin || clvl > LevelMax {
		return 0, false
	}
	base := QuestsTotal() + WaypointsTotal() + AreasTotal()
	return int64(LocationBase + base + (clvl - LevelMin)), true
}

// AreaIndexForLevelID converts the levels.txt Id D2R reports as the player's current
// area into an index in the frozen table.
//
// Returns false for anything not in the table, which is the correct response to an area
// the game knows about and the tables do not — better a missed check than a check
// attributed to the wrong place.
func AreaIndexForLevelID(levelID int) (int, bool) {
	for i, id := range AreaLevelIDs {
		if id == levelID {
			return i, true
		}
	}
	return -1, false
}

// LevelCap is the highest character level milestone active for a goal.
func LevelCap(goalDifficulty, goalAct int) int {
	if goalDifficulty < 0 || goalDifficulty >= len(LevelCaps) || goalAct < 0 || goalAct >= Acts {
		return LevelCaps[0][0]
	}
	return LevelCaps[goalDifficulty][goalAct]
}

// WaypointIndexForLevelID converts the levels.txt Id of an area into its waypoint index.
//
// The live waypoint panel in memory names waypoints by AREA, while location ids are
// keyed on the index, so something has to bridge the two. Returns false for an area that
// has no waypoint, which is the correct answer for most of the map.
func WaypointIndexForLevelID(levelID int) (int, bool) {
	for i, id := range WaypointLevelIDs {
		if id == levelID {
			return i, true
		}
	}
	return -1, false
}
