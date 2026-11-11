package ids

import "strconv"

// Reading a location id back into what it means: which kind of check, on which
// difficulty and in which act. The client's /missing and /checks group by this, and
// cmd/namedump uses it to describe every location for the site's check list.

// LocationKind is the group a location belongs to, in id order.
type LocationKind int

const (
	KindQuest LocationKind = iota
	KindWaypoint
	KindArea
	KindLevel
)

// String is the kind as the site and the client name it.
func (k LocationKind) String() string {
	switch k {
	case KindQuest:
		return "quest"
	case KindWaypoint:
		return "waypoint"
	case KindArea:
		return "area"
	case KindLevel:
		return "level"
	}
	return "unknown"
}

// LocationInfo describes one location id. Difficulty and Act are -1 for a character
// level milestone, which belongs to no single difficulty or act.
type LocationInfo struct {
	Kind       LocationKind
	Difficulty int
	Act        int
	// Index is the position within its kind and difficulty: the quest within its act,
	// the waypoint (0-38), the frozen area index, or the character level itself.
	Index int
}

// actEnds are the last levels.txt Id of each act's areas.
var actEnds = []int{39, 74, 102, 108, 132}

// waypointActEnds are the first waypoint index past each act. Act IV has only 3.
var waypointActEnds = []int{9, 18, 27, 30, 39}

// WaypointAct is the act (0-4) a waypoint index belongs to.
func WaypointAct(index int) int {
	for act, end := range waypointActEnds {
		if index < end {
			return act
		}
	}
	return -1
}

// QuestNames is indexed [act][questIndex], in the game's quest order.
var QuestNames = [][]string{
	{"Den of Evil", "Sisters' Burial Grounds", "Tools of the Trade", "The Search for Cain", "The Forgotten Tower", "Sisters to the Slaughter"},
	{"Radament's Lair", "The Horadric Staff", "Tainted Sun", "Arcane Sanctuary", "The Summoner", "The Seven Tombs"},
	{"Lam Esen's Tome", "Khalim's Will", "Blade of the Old Religion", "The Golden Bird", "The Blackened Temple", "The Guardian"},
	{"The Fallen Angel", "Terror's End", "Hell's Forge"},
	{"Siege on Harrogath", "Rescue on Mount Arreat", "Prison of Ice", "Betrayal of Harrogath", "Rite of Passage", "Eve of Destruction"},
}

// WaypointNames are the waypoints in the game's order, as location names give them.
var WaypointNames = []string{
	"Rogue Encampment", "Cold Plains", "Stony Field", "Dark Wood", "Black Marsh",
	"Outer Cloister", "Jail Level 1", "Inner Cloister", "Catacombs Level 2",
	"Lut Gholein", "Sewers Level 2", "Dry Hills", "Halls of the Dead Level 2",
	"Far Oasis", "Lost City", "Palace Cellar Level 1", "Arcane Sanctuary",
	"Canyon of the Magi",
	"Kurast Docks", "Spider Forest", "Great Marsh", "Flayer Jungle", "Lower Kurast",
	"Kurast Bazaar", "Upper Kurast", "Travincal", "Durance of Hate Level 2",
	"The Pandemonium Fortress", "City of the Damned", "River of Flame",
	"Harrogath", "Frigid Highlands", "Arreat Plateau", "Crystalline Passage",
	"Halls of Pain", "Glacial Trail", "Frozen Tundra", "The Ancients' Way",
	"Worldstone Keep Level 2",
}

// ActForLevelID is the act (0-4) a levels.txt Id belongs to, or -1 outside the table.
func ActForLevelID(levelID int) int {
	if levelID < 1 {
		return -1
	}
	for act, end := range actEnds {
		if levelID <= end {
			return act
		}
	}
	return -1
}

// Locate reads a location id. It returns false for an id outside the scheme.
func Locate(id int64) (LocationInfo, bool) {
	off := int(id - LocationBase)
	if off < 0 || off >= LocationsTotal() {
		return LocationInfo{}, false
	}
	if off < QuestsTotal() {
		per := QuestsTotal() / Difficulties
		d, rest := off/per, off%per
		for act, n := range QuestsPerAct {
			if rest < n {
				return LocationInfo{Kind: KindQuest, Difficulty: d, Act: act, Index: rest}, true
			}
			rest -= n
		}
	}
	off -= QuestsTotal()
	if off < WaypointsTotal() {
		d, i := off/Waypoints, off%Waypoints
		return LocationInfo{Kind: KindWaypoint, Difficulty: d, Act: WaypointAct(i), Index: i}, true
	}
	off -= WaypointsTotal()
	if off < AreasTotal() {
		d, i := off/Areas(), off%Areas()
		return LocationInfo{Kind: KindArea, Difficulty: d, Act: AreaActs[i], Index: i}, true
	}
	off -= AreasTotal()
	return LocationInfo{Kind: KindLevel, Difficulty: -1, Act: -1, Index: LevelMin + off}, true
}

// DifficultyNames are the difficulties as players and location names say them.
var DifficultyNames = []string{"Normal", "Nightmare", "Hell"}

// GroupLabel is how /missing and /checks head a location's group: "Normal Act II", or
// "Character levels".
func (l LocationInfo) GroupLabel() string {
	if l.Difficulty < 0 || l.Act < 0 {
		return "Character levels"
	}
	return DifficultyNames[l.Difficulty] + " Act " + []string{"I", "II", "III", "IV", "V"}[l.Act]
}

// LocationName is a location's Archipelago name, exactly as the apworld spells it.
func LocationName(id int64) (string, bool) {
	info, ok := Locate(id)
	if !ok {
		return "", false
	}
	switch info.Kind {
	case KindQuest:
		return DifficultyNames[info.Difficulty] + " A" + string(rune('1'+info.Act)) + ": " + QuestNames[info.Act][info.Index], true
	case KindWaypoint:
		return DifficultyNames[info.Difficulty] + " WP: " + WaypointNames[info.Index], true
	case KindArea:
		return DifficultyNames[info.Difficulty] + " Area: " + AreaLabels[info.Index], true
	default:
		return "Level " + strconv.Itoa(info.Index), true
	}
}

// Towns are never checks on any difficulty: neither the town nor its waypoint. A
// character starts each act standing in one with its waypoint already active. Mirror of
// TOWNS in apworld/d2rr/ids.py.
var Towns = []string{"Rogue Encampment", "Lut Gholein", "Kurast Docks", "The Pandemonium Fortress", "Harrogath"}

// IsTownCheck reports whether a location is a town's waypoint or area, which keeps its id
// but is never made a location.
func IsTownCheck(info LocationInfo) bool {
	var name string
	switch info.Kind {
	case KindWaypoint:
		name = WaypointNames[info.Index]
	case KindArea:
		name = AreaLabels[info.Index]
	default:
		return false
	}
	for _, t := range Towns {
		if name == t {
			return true
		}
	}
	return false
}
