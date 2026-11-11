package ids

// Super-unique kill checks. Mirror of SUPER_UNIQUES in apworld/d2rr/ids.py: names and acts
// must match exactly (scripts/verify-ap-ids.mjs), and position decides the location id,
// so the order is FROZEN. Each entry also says how the client recognises the monster: the
// areas it lives in (levels.txt Ids) and its monstats row (the unit's txtFileNo, the
// *hcIdx column). TestSuperUniquesMatchTheGameData checks those against the game data.

// SuperUnique is one monster whose death is a check.
type SuperUnique struct {
	Name  string
	Act   int
	Areas []int
	// Txt is the monstats row of its class, as superuniques.txt names it.
	Txt uint32
	// Class is that row's Id, kept for the data check.
	Class string
}

// SuperUniques, in id order.
var SuperUniques = []SuperUnique{
	{"Corpsefire", 0, []int{8}, 5, "zombie1"},
	{"Bishibosh", 0, []int{3}, 58, "fallenshaman1"},
	{"Bonebreaker", 0, []int{18}, 0, "skeleton1"},
	{"Coldcrow", 0, []int{9}, 160, "cr_archer1"},
	{"Rakanishu", 0, []int{4}, 20, "fallen2"},
	{"Treehead Woodfist", 0, []int{5}, 24, "brute2"},
	{"Griswold", 0, []int{38}, 365, "griswold"},
	{"Pitspawn Fouldog", 0, []int{30}, 11, "bighead2"},
	{"Bone Ash", 0, []int{33}, 276, "skmage_pois3"},
	{"The Smith", 0, []int{28}, 402, "smith"},
	{"Bloodwitch the Wild", 1, []int{60}, 83, "pantherwoman1"},
	{"Fangskin", 1, []int{61}, 75, "clawviper3"},
	{"Beetleburst", 1, []int{43}, 92, "scarab2"},
	{"Creeping Feature", 1, []int{59}, 97, "mummy2"},
	{"Coldworm the Burrower", 1, []int{64}, 284, "maggotqueen1"},
	{"Fire Eye", 1, []int{54}, 31, "sandraider3"},
	{"Dark Elder", 1, []int{44}, 736, "darkelder"},
	// In whichever of the seven tombs is not Tal Rasha's own.
	{"Ancient Kaa the Soulless", 1, []int{66, 67, 68, 69, 70, 71, 72}, 103, "unraveler3"},
	{"Sszark the Burning", 2, []int{85}, 125, "arach4"},
	{"Witch Doctor Endugu", 2, []int{91}, 281, "fetishshaman4"},
	{"Stormtree", 2, []int{79}, 129, "thornhulk3"},
	{"Battlemaid Sarina", 2, []int{94}, 47, "corruptrogue5"},
	{"Icehawk Riftwing", 2, []int{92}, 138, "batdemon3"},
	{"Hephasto the Armorer", 3, []int{107}, 409, "hephasto"},
	{"Infector of Souls", 3, []int{108}, 362, "megademon3"},
	{"Lord De Seis", 3, []int{108}, 312, "doomknight3"},
	{"Grand Vizier of Chaos", 3, []int{108}, 306, "fingermage3"},
	{"Dac Farren", 4, []int{110}, 494, "imp3"},
	{"Eldritch the Rectifier", 4, []int{111}, 453, "minion1"},
	{"Sharptooth Slayer", 4, []int{111}, 481, "overseer3"},
	{"Eyeback the Unleashed", 4, []int{111}, 529, "deathmauler1"},
	{"Thresh Socket", 4, []int{112}, 443, "siegebeast3"},
	{"Frozenstein", 4, []int{114}, 449, "snowyeti4"},
	{"Bonesaw Breaker", 4, []int{115}, 437, "reanimatedhorde2"},
	{"Snapchip Shatter", 4, []int{119}, 501, "frozenhorror1"},
	{"Pindleskin", 4, []int{121}, 440, "reanimatedhorde5"},
	{"Colenzo the Annihilator", 4, []int{131}, 62, "fallenshaman5"},
	{"Achmel the Cursed", 4, []int{131}, 105, "unraveler5"},
	{"Bartuc the Bloody", 4, []int{131}, 557, "baalhighpriest"},
	{"Ventar the Unholy", 4, []int{131}, 558, "venomlord"},
	{"Lister the Tormentor", 4, []int{131}, 571, "baalminion1"},
}

// KillsTotal is 123: 41 super-uniques across 3 difficulties.
func KillsTotal() int { return Difficulties * len(SuperUniques) }

// KillLocationID maps a super-unique's death on a difficulty to its location id. Kills
// follow every level milestone in the id space.
func KillLocationID(difficulty, index int) (int64, bool) {
	if difficulty < 0 || difficulty >= Difficulties || index < 0 || index >= len(SuperUniques) {
		return 0, false
	}
	base := QuestsTotal() + WaypointsTotal() + AreasTotal() + LevelsTotal()
	return int64(LocationBase + base + difficulty*len(SuperUniques) + index), true
}

// SuperUniqueFor reports which super-unique a monster is: one of its class standing in one
// of its areas. False for anything else, including the same class elsewhere.
func SuperUniqueFor(txt uint32, area int) (int, bool) {
	for i, su := range SuperUniques {
		if su.Txt != txt {
			continue
		}
		for _, a := range su.Areas {
			if a == area {
				return i, true
			}
		}
	}
	return -1, false
}
