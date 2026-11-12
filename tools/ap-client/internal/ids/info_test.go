package ids

import "testing"

func TestLocateReadsEveryKind(t *testing.T) {
	q, _ := QuestLocationID(1, 3, 2)
	w, _ := WaypointLocationID(2, 9) // Lut Gholein: the first Act II waypoint
	ar, _ := AreaLocationID(0, 1)    // Blood Moor
	lv, _ := LevelLocationID(30)
	cases := []struct {
		id   int64
		want LocationInfo
	}{
		{q, LocationInfo{KindQuest, 1, 3, 2}},
		{w, LocationInfo{KindWaypoint, 2, 1, 9}},
		{ar, LocationInfo{KindArea, 0, 0, 1}},
		{lv, LocationInfo{KindLevel, -1, -1, 30}},
	}
	for _, c := range cases {
		got, ok := Locate(c.id)
		if !ok || got != c.want {
			t.Fatalf("Locate(%d) = %+v, want %+v", c.id, got, c.want)
		}
	}
	if _, ok := Locate(LocationBase + int64(LocationsTotal())); ok {
		t.Fatal("an id past the table was located")
	}
	// Every id resolves, and every quest, waypoint and area lands in a real act.
	for off := 0; off < LocationsTotal(); off++ {
		info, ok := Locate(LocationBase + int64(off))
		if !ok || (info.Kind != KindLevel && (info.Act < 0 || info.Act >= Acts)) {
			t.Fatalf("offset %d: %+v", off, info)
		}
	}
	if got := (LocationInfo{Difficulty: 1, Act: 4}).GroupLabel(); got != "Nightmare Act V" {
		t.Fatal(got)
	}
}
