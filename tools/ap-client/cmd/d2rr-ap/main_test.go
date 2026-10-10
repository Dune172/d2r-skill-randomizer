package main

import (
	"context"
	"encoding/binary"
	"os"
	"path/filepath"
	"testing"

	"github.com/swannysoft/d2rr-ap-client/internal/apc"
	"github.com/swannysoft/d2rr-ap-client/internal/ids"
	"github.com/swannysoft/d2rr-ap-client/internal/manifest"
	"github.com/swannysoft/d2rr-ap-client/internal/save"
)

func TestLocalManifestWaitsForCompatibleRoom(t *testing.T) {
	a := &app{man: &manifest.Manifest{}, saveDir: t.TempDir()}
	if a.ready() {
		t.Fatal("local manifest allowed game writes before the room handshake")
	}
}

func TestLiveQuestsWaitForSave(t *testing.T) {
	if got := (&app{}).liveQuestChecks(nil, 0); len(got) != 0 {
		t.Fatalf("no save should yield no live checks, got %v", got)
	}
}

func TestSaveChecksRespectRoomOptions(t *testing.T) {
	for _, tc := range []struct {
		name      string
		goal      int
		waypoints bool
		want      int
	}{
		{"normal without waypoints", 0, false, 2},
		{"normal with waypoints", 0, true, 3},
		{"nightmare without waypoints", 1, false, 3},
		{"nightmare with waypoints", 1, true, 5},
	} {
		t.Run(tc.name, func(t *testing.T) {
			dir := t.TempDir()
			data := make([]byte, 900)
			binary.LittleEndian.PutUint32(data, 0xaa55aa55)
			copy(data[403:], "Woo!")
			copy(data[701:], "WS")
			copy(data[0x12B:], "Test")
			data[413+2] = 1    // Normal Den of Evil
			data[413+76] = 1   // Normal Baal unlocks Nightmare
			data[413+96+2] = 1 // Nightmare Den of Evil
			for d := 0; d < 3; d++ {
				data[709+d*24+2] = 1 // town waypoint pre-set in all difficulties
			}
			if err := os.WriteFile(filepath.Join(dir, "Test.d2s"), data, 0o600); err != nil {
				t.Fatal(err)
			}
			session, err := apc.NewSession(t.TempDir(), "room", "slot")
			if err != nil {
				t.Fatal(err)
			}
			if err := session.BindCharacter("Test"); err != nil {
				t.Fatal(err)
			}
			a := &app{saveDir: dir, session: session, goalDifficulty: tc.goal,
				includeWaypoints: tc.waypoints, lastSeen: map[string]bool{},
				conn: apc.NewConn("127.0.0.1", 1, "slot", "", session, apc.Handler{})}
			a.pollSave(context.Background())
			checks := session.AllChecks()
			if len(checks) != tc.want {
				t.Fatalf("got %v, want %d checks", checks, tc.want)
			}
			hellWP, _ := ids.WaypointLocationID(2, 0)
			for _, check := range checks {
				if check == hellWP {
					t.Fatal("reported a locked Hell waypoint")
				}
			}
			a.pollSave(context.Background())
			if len(session.AllChecks()) != tc.want {
				t.Fatal("second poll duplicated checks")
			}
		})
	}
}

func TestSaveSelectionDoesNotMergeCharacters(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "One.d2s"), nil, 0600)
	os.WriteFile(filepath.Join(dir, "Two.d2s"), nil, 0600)
	if _, e := selectSave(dir, ""); e == nil {
		t.Fatal("silently selected one of several characters")
	}
	if p, e := selectSave(dir, "One"); e != nil || filepath.Base(p) != "One.d2s" {
		t.Fatalf("%s %v", p, e)
	}
	if _, e := selectSave(dir, "../Other"); e == nil {
		t.Fatal("accepted a character outside the folder")
	}
}
func TestTrainingFragmentsAreIdempotent(t *testing.T) {
	s, e := apc.NewSession(t.TempDir(), "room", "slot")
	if e != nil {
		t.Fatal(e)
	}
	a := &app{session: s}
	items := []apc.NetworkItem{{Item: ids.SkillPointItemID}}
	for i := 0; i < 5; i++ {
		items = append(items, apc.NetworkItem{Item: ids.TrainingFragmentItemID})
	}
	s.ApplyReceivedItems(0, items)
	a.recomputeDesired()
	if a.pointsReceived != 2 {
		t.Fatal("five fragments should add one point")
	}
	s.ApplyReceivedItems(0, items)
	a.recomputeDesired()
	if a.pointsReceived != 2 {
		t.Fatal("resync duplicated training reward")
	}
}

func TestGoalIsTheQuestThatRecordsTheBossOnTheGoalDifficulty(t *testing.T) {
	quest := func(d, act, index int) *save.State {
		return &save.State{CompletedQuests: []save.Quest{{Difficulty: d, Act: act, Index: index}}}
	}
	for act, index := range ids.GoalQuestIndex {
		if !goalReached(quest(1, act, index), 1, act) {
			t.Errorf("act %d: the boss quest did not complete the goal", act)
		}
		if goalReached(quest(0, act, index), 1, act) {
			t.Errorf("act %d: the boss on an easier difficulty completed the goal", act)
		}
		if goalReached(quest(1, act, 0), 1, act) && index != 0 {
			t.Errorf("act %d: another quest of the act completed the goal", act)
		}
	}
	// Baal must not complete a Diablo goal, and an out-of-range act must not panic.
	if goalReached(quest(0, 4, 5), 0, 3) || goalReached(quest(0, 4, 5), 0, 9) {
		t.Fatal("the wrong boss completed the goal")
	}
}

func TestMailboxMapsRuneCodesToTheirArchipelagoItems(t *testing.T) {
	tables := manifest.Tables{MailIdle: 1, MailAttuned: 128, Mail: []manifest.MailItem{
		{Offer: 2, Item: "r01", Name: "El Rune"},
		{Offer: 66, Item: "r33", Name: "Zod Rune"},
		{Offer: 70, Item: "zzz", Name: "Not a rune"},
	}}
	box := mailboxFor(tables)
	if len(box.Entries) != 2 || box.Idle != 1 || box.Attuned != 128 {
		t.Fatalf("%+v", box)
	}
	names := ids.ItemNames()
	if box.Entries[0].ItemID != names["El Rune"] || box.Entries[1].ItemID != names["Zod Rune"] {
		t.Fatalf("rune ids %d %d", box.Entries[0].ItemID, box.Entries[1].ItemID)
	}
}

func TestChecksTheRoomDoesNotHaveAreNeverRecorded(t *testing.T) {
	session, err := apc.NewSession(t.TempDir(), "room", "slot")
	if err != nil {
		t.Fatal(err)
	}
	a := &app{session: session, lastSeen: map[string]bool{},
		conn: apc.NewConn("127.0.0.1", 1, "slot", "", session, apc.Handler{})}
	// Before the room has said what exists, checks are kept for the reconnect.
	a.sendChecks(context.Background(), []int64{10})
	if len(session.AllChecks()) != 1 {
		t.Fatalf("offline check was dropped: %v", session.AllChecks())
	}
}
