// Package ids defines the Archipelago item and location id scheme.
//
// THIS IS A CONTRACT WITH THE APWORLD. The apworld generates offline and must produce
// identical id tables, so both sides derive ids from the same fixed ordering rather than
// sharing data at runtime. Mirror of apworld/d2rr/ids.py; scripts/verify-ap-ids.mjs
// requires exact agreement.
//
// Ids are IMMUTABLE once a multiworld exists. Changing one silently re-keys every
// in-flight room, which is why the orderings below are spelled out explicitly instead of
// being derived from anything that could be reordered later.
package ids

const (
	ItemBase     = 5_720_000
	LocationBase = 5_721_000

	Difficulties = 3
	Acts         = 5
	Waypoints    = 39
)

// Classes in CLASS_DEFS order. Warlock is a full D2RR class and is included.
var Classes = []string{"ama", "sor", "nec", "pal", "bar", "dru", "ass", "war"}

// QuestsPerAct matches the game: Act IV has 3, the rest 6. 27 per difficulty.
var QuestsPerAct = []int{6, 6, 6, 3, 6}

// GoalQuestIndex is the quest, per act, that records the act boss's death.
var GoalQuestIndex = []int{5, 5, 5, 1, 5}

// Items. Every name and id must match the apworld's table exactly.
const (
	// SkillPointItem is THE progression item: one unspent skill point. The player
	// spends it and the game builds the skill.
	SkillPointItem   = "Progressive Skill Point"
	SkillPointItemID = int64(ItemBase + 2000)

	// TrainingFragmentItem is filler: FragmentsPerPoint of them make one bonus point.
	TrainingFragmentItem   = "Training Fragment"
	TrainingFragmentItemID = int64(ItemBase + 2001)
	FragmentsPerPoint      = 5

	// StatPointsItem is one level-up's worth of attribute points.
	StatPointsItem    = "Stat Points"
	StatPointsItemID  = int64(ItemBase + 2002)
	StatPointsPerItem = 5

	// HoradricKeyItem opens the Cube's quest recipes: two for the Horadric Staff, five
	// for Khalim's Will.
	HoradricKeyItem      = "Progressive Horadric Key"
	HoradricKeyItemID    = int64(ItemBase + 2003)
	KeysForHoradricStaff = 2
	KeysForKhalimsWill   = 5

	GoldItem   = "Gold"
	GoldItemID = int64(ItemBase + 2004)

	TrapIDBase = int64(ItemBase + 2010)
	RuneIDBase = int64(ItemBase + 2100)
)

// Trap is the position of a trap in Traps.
type Trap int

const (
	TrapManaBurn Trap = iota
	TrapExhaustion
	TrapBrushWithDeath
	TrapSkillLock
	TrapGoldTax
)

// Traps, in id order.
var Traps = []string{
	"Mana Burn Trap",
	"Exhaustion Trap",
	"Brush with Death Trap",
	"Skill Lock Trap",
	"Gold Tax Trap",
}

// RuneNames, in the game's order: El is r01, Zod is r33.
var RuneNames = []string{
	"El", "Eld", "Tir", "Nef", "Eth", "Ith", "Tal", "Ral", "Ort", "Thul", "Amn", "Sol",
	"Shael", "Dol", "Hel", "Io", "Lum", "Ko", "Fal", "Lem", "Pul", "Um", "Mal", "Ist",
	"Gul", "Vex", "Ohm", "Lo", "Sur", "Ber", "Jah", "Cham", "Zod",
}

// RuneItemName is the Archipelago item name of a rune.
func RuneItemName(index int) string { return RuneNames[index] + " Rune" }

// TrapForItem reports which trap an item id is, if it is one.
func TrapForItem(id int64) (Trap, bool) {
	off := id - TrapIDBase
	if off < 0 || off >= int64(len(Traps)) {
		return 0, false
	}
	return Trap(off), true
}

// RuneForItem reports which rune (0 = El) an item id is, if it is one.
func RuneForItem(id int64) (int, bool) {
	off := id - RuneIDBase
	if off < 0 || off >= int64(len(RuneNames)) {
		return 0, false
	}
	return int(off), true
}

// ItemNames is every item name and its id.
func ItemNames() map[string]int64 {
	out := map[string]int64{
		SkillPointItem:       SkillPointItemID,
		TrainingFragmentItem: TrainingFragmentItemID,
		StatPointsItem:       StatPointsItemID,
		HoradricKeyItem:      HoradricKeyItemID,
		GoldItem:             GoldItemID,
	}
	for i, name := range Traps {
		out[name] = TrapIDBase + int64(i)
	}
	for i := range RuneNames {
		out[RuneItemName(i)] = RuneIDBase + int64(i)
	}
	return out
}

// questSeq is the position of a quest in the flat, deterministic quest ordering:
// difficulty, then act, then index within the act.
func questSeq(difficulty, act, index int) (int, bool) {
	if difficulty < 0 || difficulty >= Difficulties || act < 0 || act >= len(QuestsPerAct) {
		return 0, false
	}
	if index < 0 || index >= QuestsPerAct[act] {
		return 0, false
	}
	perDifficulty := 0
	for _, n := range QuestsPerAct {
		perDifficulty += n
	}
	seq := difficulty * perDifficulty
	for a := 0; a < act; a++ {
		seq += QuestsPerAct[a]
	}
	return seq + index, true
}

// QuestsTotal is 27 per difficulty across 3 difficulties.
func QuestsTotal() int {
	per := 0
	for _, n := range QuestsPerAct {
		per += n
	}
	return per * Difficulties
}

// QuestLocationID maps a completed quest to its Archipelago location id.
func QuestLocationID(difficulty, act, index int) (int64, bool) {
	seq, ok := questSeq(difficulty, act, index)
	if !ok {
		return 0, false
	}
	return int64(LocationBase + seq), true
}

// WaypointLocationID maps an activated waypoint to its location id. Waypoints follow
// every quest in the id space.
func WaypointLocationID(difficulty, index int) (int64, bool) {
	if difficulty < 0 || difficulty >= Difficulties || index < 0 || index >= Waypoints {
		return 0, false
	}
	return int64(LocationBase + QuestsTotal() + difficulty*Waypoints + index), true
}

// LocationsTotal is every location this scheme defines: 689.
//
// 81 quests + 117 waypoints + 393 areas + 98 level milestones, laid out in that order
// with each group appended after the last.
func LocationsTotal() int {
	return QuestsTotal() + WaypointsTotal() + AreasTotal() + LevelsTotal()
}
