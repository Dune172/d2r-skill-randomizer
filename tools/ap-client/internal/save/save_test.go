package save

import (
	"encoding/binary"
	"os"
	"path/filepath"
	"testing"
)

// syntheticSave builds the smallest buffer Parse accepts: the magic, both section
// markers at their D2R offsets, the waypoint block prologues and a name. Everything
// else is zero, so a test sets exactly the bits it means to read back.
func syntheticSave(name string) []byte {
	data := make([]byte, waypointDataStart+Difficulties*waypointBlockSize+64)
	binary.LittleEndian.PutUint32(data, magic)
	copy(data[questMarkerOffset:], "Woo!")
	copy(data[waypointMarkerOffset:], "WS")
	for d := 0; d < Difficulties; d++ {
		b := waypointDataStart + d*waypointBlockSize
		data[b], data[b+1] = 0x02, 0x01
	}
	copy(data[nameOffset:], name)
	return data
}

func setQuest(data []byte, difficulty, act, index int) {
	off := questDataStart + difficulty*questBlockSize + questWordOffsets[act][index]
	data[off] |= 1
}

func setWaypoint(data []byte, difficulty, index int) {
	b := waypointDataStart + difficulty*waypointBlockSize + waypointBitsOffset
	data[b+index/8] |= 1 << (index % 8)
}

func TestParseReadsExactlyTheBitsThatAreSet(t *testing.T) {
	data := syntheticSave("Fixture")
	setQuest(data, 0, 0, 0)  // Den of Evil, normal
	setQuest(data, 0, 3, 2)  // Hell's Forge: Act IV has only three quest words
	setQuest(data, 2, 4, 5)  // Eve of Destruction, hell
	setWaypoint(data, 0, 0)  // Rogue Encampment
	setWaypoint(data, 1, 38) // the last waypoint, in the last byte of its bitfield

	st, err := Parse(data)
	if err != nil {
		t.Fatal(err)
	}
	if st.Name != "Fixture" {
		t.Errorf("name %q", st.Name)
	}
	wantQuests := []string{"q:0:0:0", "q:0:3:2", "q:2:4:5"}
	wantWaypoints := []string{"wp:0:0", "wp:1:38"}
	got := st.CheckIDs()
	want := append(wantQuests, wantWaypoints...)
	if len(got) != len(want) {
		t.Fatalf("checks %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("checks %v, want %v", got, want)
		}
	}
}

// Words that are not quests must never become checks: the act intro and completion
// words sit between the quest words, and a framing error would read them.
func TestParseIgnoresActIntroAndCompletionWords(t *testing.T) {
	data := syntheticSave("Fixture")
	for d := 0; d < Difficulties; d++ {
		base := questDataStart + d*questBlockSize
		for _, off := range []int{0, 14, 16, 30, 32, 46, 48, 56, 64, 78} {
			data[base+off] = 0x01
			data[base+off+1] = 0x20
		}
	}
	st, err := Parse(data)
	if err != nil {
		t.Fatal(err)
	}
	if len(st.CompletedQuests) != 0 {
		t.Errorf("non-quest words read as quests: %+v", st.CompletedQuests)
	}
}

// A moved marker must be an error, never a silently shifted read.
func TestParseRejectsMovedMarkers(t *testing.T) {
	data := syntheticSave("Fixture")
	copy(data[questMarkerOffset:], []byte{0, 0, 0, 0})
	copy(data[questMarkerOffset-68:], "Woo!") // the classic-D2 position
	if _, err := Parse(data); err == nil {
		t.Error("accepted a quest marker at the classic offset")
	}
	data = syntheticSave("Fixture")
	data[waypointMarkerOffset] = 0
	if _, err := Parse(data); err == nil {
		t.Error("accepted a missing waypoint marker")
	}
}

// The three quest blocks must sit flush against the waypoint marker.
func TestQuestBlocksEndAtTheWaypointMarker(t *testing.T) {
	if end := questDataStart + Difficulties*questBlockSize; end != waypointMarkerOffset {
		t.Fatalf("quest blocks end at %d but waypoint marker is at %d", end, waypointMarkerOffset)
	}
}

// Real D2R saves, for re-measuring the layout after a game patch. The constants in
// save.go came from saves like these, so synthetic fixtures alone only prove the parser
// agrees with itself.
//
// Opt-in: set D2RR_SAVE_DIR to a folder of .d2s files. Not defaulted to the player's
// own save folder, so the suite gives the same answer on every machine.
func realSaves(t *testing.T) []string {
	t.Helper()
	dir := os.Getenv("D2RR_SAVE_DIR")
	if dir == "" {
		t.Skip("set D2RR_SAVE_DIR to check real saves")
	}
	matches, err := filepath.Glob(filepath.Join(dir, "*.d2s"))
	if err != nil || len(matches) == 0 {
		t.Skipf("no real D2R saves under %s", dir)
	}
	return matches
}

// The whole parser rests on D2R's markers sitting 68 bytes later than every published
// classic-D2 layout. If that ever stops holding we want a hard failure, not silently
// misread checks.
func TestMarkersAtD2ROffsets(t *testing.T) {
	for _, path := range realSaves(t) {
		data, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("%s: %v", path, err)
		}
		name := filepath.Base(path)
		if got := string(data[questMarkerOffset : questMarkerOffset+4]); got != "Woo!" {
			t.Errorf("%s: quest marker at %d = %q, want \"Woo!\"", name, questMarkerOffset, got)
		}
		if got := string(data[waypointMarkerOffset : waypointMarkerOffset+2]); got != "WS" {
			t.Errorf("%s: waypoint marker at %d = %q, want \"WS\"", name, waypointMarkerOffset, got)
		}
		// Classic offsets must NOT match, or our +68 assumption is confused.
		if len(data) > 339 && string(data[335:339]) == "Woo!" {
			t.Errorf("%s: classic quest offset 335 also matches — layout assumption is wrong", name)
		}
	}
}

// Every waypoint block opens with the same 2-byte prologue; that repetition is what
// pins the block stride.
func TestWaypointBlockStride(t *testing.T) {
	for _, path := range realSaves(t) {
		data, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("%s: %v", path, err)
		}
		name := filepath.Base(path)
		for d := 0; d < Difficulties; d++ {
			b := waypointDataStart + d*waypointBlockSize
			if data[b] != 0x02 || data[b+1] != 0x01 {
				t.Errorf("%s diff %d: waypoint block at %d starts %02x %02x, want 02 01",
					name, d, b, data[b], data[b+1])
			}
		}
	}
}

// Rogue Encampment is granted on character creation, so normal-difficulty waypoint 0
// is set on every save that exists at all.
func TestFirstWaypointAlwaysSet(t *testing.T) {
	for _, path := range realSaves(t) {
		st, err := ParseFile(path)
		if err != nil {
			t.Errorf("%s: %v", filepath.Base(path), err)
			continue
		}
		found := false
		for _, w := range st.ActiveWaypoints {
			if w.Difficulty == 0 && w.Index == 0 {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("%s: normal waypoint 0 (Rogue Encampment) not set", filepath.Base(path))
		}
	}
}

// Progress must be monotonic across difficulties: you cannot have hell checks without
// normal ones. A stride error would scatter bits across difficulties and trip this.
func TestProgressIsMonotonicAcrossDifficulties(t *testing.T) {
	for _, path := range realSaves(t) {
		st, err := ParseFile(path)
		if err != nil {
			continue
		}
		var perDiff [Difficulties]int
		for _, q := range st.CompletedQuests {
			perDiff[q.Difficulty]++
		}
		for d := 1; d < Difficulties; d++ {
			if perDiff[d] > 0 && perDiff[d-1] == 0 {
				t.Errorf("%s: %d quests in %s but none in %s — difficulty stride is wrong",
					filepath.Base(path), perDiff[d], DifficultyNames[d], DifficultyNames[d-1])
			}
		}
	}
}

func TestCheckIDsAreUnique(t *testing.T) {
	for _, path := range realSaves(t) {
		st, err := ParseFile(path)
		if err != nil {
			continue
		}
		seen := map[string]bool{}
		for _, id := range st.CheckIDs() {
			if seen[id] {
				t.Errorf("%s: duplicate check id %s", filepath.Base(path), id)
			}
			seen[id] = true
		}
	}
}

// The character name must match the filename: D2R names saves after the character, so
// this catches a wrong name offset (classic D2's 0x14 yields an empty string).
func TestNameMatchesFilename(t *testing.T) {
	for _, path := range realSaves(t) {
		st, err := ParseFile(path)
		if err != nil {
			continue
		}
		want := filepath.Base(path)
		want = want[:len(want)-len(".d2s")]
		if st.Name != want {
			t.Errorf("%s: parsed name %q, want %q", filepath.Base(path), st.Name, want)
		}
	}
}

func TestRejectsNonSaveData(t *testing.T) {
	if _, err := Parse(make([]byte, 2000)); err == nil {
		t.Error("expected an error for zeroed data, got nil")
	}
	if _, err := Parse([]byte{1, 2, 3}); err == nil {
		t.Error("expected an error for a short buffer, got nil")
	}
}
