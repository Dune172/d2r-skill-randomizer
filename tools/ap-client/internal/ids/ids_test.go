package ids

import "testing"

// These ids are a CONTRACT: they are baked into every generated multiworld, and the
// apworld derives the same values independently. The tests below pin the properties the
// apworld relies on, so a refactor cannot silently renumber an in-flight room.

func TestItemIDsAreUniqueAndStable(t *testing.T) {
	names := ItemNames()
	seen := map[int64]string{}
	for name, id := range names {
		if prev, dup := seen[id]; dup {
			t.Fatalf("item id %d is both %q and %q", id, prev, name)
		}
		seen[id] = name
	}
	if want := 5 + len(Traps) + len(RuneNames); len(names) != want {
		t.Errorf("got %d items, want %d", len(names), want)
	}
	// Spot-check the anchors. If these change, every existing room breaks.
	for name, want := range map[string]int64{
		"Progressive Skill Point":  ItemBase + 2000,
		"Training Fragment":        ItemBase + 2001,
		"Stat Points":              ItemBase + 2002,
		"Progressive Horadric Key": ItemBase + 2003,
		"Gold":                     ItemBase + 2004,
		"Mana Burn Trap":           ItemBase + 2010,
		"Gold Tax Trap":            ItemBase + 2014,
		"El Rune":                  ItemBase + 2100,
		"Zod Rune":                 ItemBase + 2132,
	} {
		if names[name] != want {
			t.Errorf("%s = %d, want %d", name, names[name], want)
		}
	}
}

func TestTrapAndRuneLookupsRoundTrip(t *testing.T) {
	for i := range Traps {
		got, ok := TrapForItem(TrapIDBase + int64(i))
		if !ok || int(got) != i {
			t.Errorf("TrapForItem(%d) = %d, %v", i, got, ok)
		}
	}
	for i := range RuneNames {
		got, ok := RuneForItem(RuneIDBase + int64(i))
		if !ok || got != i {
			t.Errorf("RuneForItem(%d) = %d, %v", i, got, ok)
		}
	}
	for _, id := range []int64{SkillPointItemID, GoldItemID, TrapIDBase - 1, TrapIDBase + int64(len(Traps)), RuneIDBase + int64(len(RuneNames))} {
		if _, ok := TrapForItem(id); ok {
			t.Errorf("TrapForItem(%d) accepted a non-trap", id)
		}
		if _, ok := RuneForItem(id); ok {
			t.Errorf("RuneForItem(%d) accepted a non-rune", id)
		}
	}
	if TrapGoldTax != Trap(len(Traps)-1) || Traps[TrapSkillLock] != "Skill Lock Trap" {
		t.Error("the Trap constants no longer line up with the Traps table")
	}
}

func TestLevelCapsRiseThroughTheGame(t *testing.T) {
	last := 1
	for d := range LevelCaps {
		for act := 0; act < Acts; act++ {
			if got := LevelCap(d, act); got <= last {
				t.Errorf("LevelCap(%d,%d) = %d does not exceed %d", d, act, got, last)
			} else {
				last = got
			}
		}
	}
	if LevelCap(9, 0) != LevelCaps[0][0] || LevelCap(0, 9) != LevelCaps[0][0] {
		t.Error("an out-of-range goal must fall back to the lowest cap")
	}
}

func TestLocationIDsAreUnique(t *testing.T) {
	seen := map[int64]string{}
	for d := 0; d < Difficulties; d++ {
		for act, n := range QuestsPerAct {
			for i := 0; i < n; i++ {
				id, ok := QuestLocationID(d, act, i)
				if !ok {
					t.Fatalf("QuestLocationID(%d,%d,%d) not ok", d, act, i)
				}
				if prev, dup := seen[id]; dup {
					t.Fatalf("location id %d collides (%s)", id, prev)
				}
				seen[id] = "quest"
			}
		}
		for i := 0; i < Waypoints; i++ {
			id, ok := WaypointLocationID(d, i)
			if !ok {
				t.Fatalf("WaypointLocationID(%d,%d) not ok", d, i)
			}
			if prev, dup := seen[id]; dup {
				t.Fatalf("location id %d collides with a %s", id, prev)
			}
			seen[id] = "waypoint"
		}
		for i := 0; i < Areas(); i++ {
			id, ok := AreaLocationID(d, i)
			if !ok {
				t.Fatalf("AreaLocationID(%d,%d) not ok", d, i)
			}
			if prev, dup := seen[id]; dup {
				t.Fatalf("location id %d collides with a %s", id, prev)
			}
			seen[id] = "area"
		}
	}
	for clvl := LevelMin; clvl <= LevelMax; clvl++ {
		id, ok := LevelLocationID(clvl)
		if !ok {
			t.Fatalf("LevelLocationID(%d) not ok", clvl)
		}
		if prev, dup := seen[id]; dup {
			t.Fatalf("location id %d collides with a %s", id, prev)
		}
		seen[id] = "level"
	}
	if len(seen) != LocationsTotal() {
		t.Errorf("got %d location ids, want %d", len(seen), LocationsTotal())
	}
}

func TestLocationCounts(t *testing.T) {
	if got := QuestsTotal(); got != 81 {
		t.Errorf("QuestsTotal() = %d, want 81 (27 quests x 3 difficulties)", got)
	}
	if got := WaypointsTotal(); got != 117 {
		t.Errorf("WaypointsTotal() = %d, want 117 (39 waypoints x 3 difficulties)", got)
	}
	if got := Areas(); got != 137 {
		t.Errorf("Areas() = %d, want 137", got)
	}
	if got := AreasTotal(); got != 411 {
		t.Errorf("AreasTotal() = %d, want 411 (137 areas x 3 difficulties)", got)
	}
	if got := LevelsTotal(); got != 98 {
		t.Errorf("LevelsTotal() = %d, want 98 (clvl 2..99)", got)
	}
	if got := LocationsTotal(); got != 81+117+411+98 {
		t.Errorf("LocationsTotal() = %d, want 707", got)
	}
}

// The id space is APPEND-ONLY. Rooms generated before areas and level milestones existed
// must still resolve to the same checks, so these anchors make "append, never renumber"
// enforceable rather than a convention someone remembers. A failure here means an
// in-flight multiworld has been silently re-keyed and cannot be fixed forward.
func TestGroupBoundariesAreFrozen(t *testing.T) {
	for _, c := range []struct {
		name string
		got  func() (int64, bool)
		want int64
	}{
		{"first quest", func() (int64, bool) { return QuestLocationID(0, 0, 0) }, LocationBase + 0},
		{"first waypoint", func() (int64, bool) { return WaypointLocationID(0, 0) }, LocationBase + 81},
		{"first area", func() (int64, bool) { return AreaLocationID(0, 0) }, LocationBase + 198},
		{"first level", func() (int64, bool) { return LevelLocationID(LevelMin) }, LocationBase + 609},
	} {
		got, ok := c.got()
		if !ok {
			t.Fatalf("%s: not ok", c.name)
		}
		if got != c.want {
			t.Errorf("%s id = %d, want %d — the id space MOVED", c.name, got, c.want)
		}
	}
}

func TestAreaTableRoundTrips(t *testing.T) {
	if len(AreaLabels) != Areas() || len(AreaActs) != Areas() {
		t.Fatalf("area tables disagree: %d ids, %d labels, %d acts",
			len(AreaLevelIDs), len(AreaLabels), len(AreaActs))
	}
	// Duplicate labels would collapse two areas into one location and drop a check.
	seen := map[string]bool{}
	for _, l := range AreaLabels {
		if seen[l] {
			t.Errorf("duplicate area label %q", l)
		}
		seen[l] = true
	}
	for i, levelID := range AreaLevelIDs {
		if got, ok := AreaIndexForLevelID(levelID); !ok || got != i {
			t.Errorf("AreaIndexForLevelID(%d) = %d,%v; want %d,true", levelID, got, ok, i)
		}
	}
	// An area the game knows and the table does not must MISS, never guess.
	if _, ok := AreaIndexForLevelID(9999); ok {
		t.Error("AreaIndexForLevelID accepted a level id that is not in the table")
	}
}

func TestLevelLocationRejectsOutOfRange(t *testing.T) {
	// Level 1 is where every character starts; it is not an achievement, and treating
	// it as one would send a check the instant the client attaches.
	if _, ok := LevelLocationID(1); ok {
		t.Error("LevelLocationID accepted clvl 1")
	}
	if _, ok := LevelLocationID(LevelMax + 1); ok {
		t.Error("LevelLocationID accepted a level above the maximum")
	}
}

// Waypoints must sit AFTER every quest in the id space. Area-discovery checks are
// deferred (memory-only), so they must append rather than renumber — which only works
// if the existing ordering is contiguous and anchored.
func TestWaypointsFollowQuestsContiguously(t *testing.T) {
	lastAct := len(QuestsPerAct) - 1
	lastQuest, _ := QuestLocationID(Difficulties-1, lastAct, QuestsPerAct[lastAct]-1)
	firstWaypoint, _ := WaypointLocationID(0, 0)
	if firstWaypoint != lastQuest+1 {
		t.Errorf("first waypoint id %d does not immediately follow last quest id %d",
			firstWaypoint, lastQuest)
	}
}

func TestQuestIDRejectsInvalidInput(t *testing.T) {
	// Act IV has only 3 quests; index 3 must be rejected rather than aliasing Act V.
	if _, ok := QuestLocationID(0, 3, 3); ok {
		t.Error("QuestLocationID accepted Act IV quest index 3 (Act IV has 3 quests)")
	}
	if _, ok := QuestLocationID(3, 0, 0); ok {
		t.Error("QuestLocationID accepted difficulty 3")
	}
	if _, ok := WaypointLocationID(0, Waypoints); ok {
		t.Error("WaypointLocationID accepted an out-of-range waypoint")
	}
}
