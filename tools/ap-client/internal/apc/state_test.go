package apc

import (
	"os"
	"testing"
)

// Each test below maps to a hard requirement from Archipelago's adding-games doc.
// They run with no server and no game, which is the point: these are exactly the
// behaviours that are painful to exercise against a live multiworld.

func newTestSession(t *testing.T) *Session {
	t.Helper()
	s, err := NewSession(t.TempDir(), "room-1", "slot-1")
	if err != nil {
		t.Fatalf("NewSession: %v", err)
	}
	return s
}

// REQUIREMENT: checks made while disconnected must be sent on reconnect. The client
// therefore sends its ENTIRE set on connect, not a delta.
func TestOfflineChecksSurviveAndAreResentInFull(t *testing.T) {
	dir := t.TempDir()
	s, _ := NewSession(dir, "room-1", "slot-1")

	if _, err := s.AddChecks([]int64{10, 11}); err != nil {
		t.Fatal(err)
	}
	// Simulate being offline: more checks accumulate with no send.
	if _, err := s.AddChecks([]int64{12, 13}); err != nil {
		t.Fatal(err)
	}

	// Reconnect as a fresh process — state must come back off disk.
	reloaded, err := NewSession(dir, "room-1", "slot-1")
	if err != nil {
		t.Fatal(err)
	}
	got := reloaded.AllChecks()
	if len(got) != 4 {
		t.Fatalf("after reload got %d checks, want 4 (offline checks were lost)", len(got))
	}
	for i, want := range []int64{10, 11, 12, 13} {
		if got[i] != want {
			t.Errorf("check[%d] = %d, want %d", i, got[i], want)
		}
	}
}

func TestAddChecksIsIdempotent(t *testing.T) {
	s := newTestSession(t)

	added, _ := s.AddChecks([]int64{1, 2, 3})
	if len(added) != 3 {
		t.Fatalf("first add returned %d, want 3", len(added))
	}
	added, _ = s.AddChecks([]int64{2, 3})
	if len(added) != 0 {
		t.Errorf("re-adding known checks returned %v, want none", added)
	}
	added, _ = s.AddChecks([]int64{3, 4})
	if len(added) != 1 || added[0] != 4 {
		t.Errorf("mixed add returned %v, want [4]", added)
	}
	if n := len(s.AllChecks()); n != 4 {
		t.Errorf("total checks = %d, want 4", n)
	}
}

// REQUIREMENT: index 0 means the server is resending everything. Local state must be
// rebuilt, not appended to, or a reconnect doubles every item.
func TestIndexZeroIsAFullResync(t *testing.T) {
	s := newTestSession(t)

	if _, err := s.ApplyReceivedItems(0, []NetworkItem{{Item: 100}, {Item: 100}, {Item: 200}}); err != nil {
		t.Fatal(err)
	}
	if got := s.Count(100); got != 2 {
		t.Fatalf("Count(100) = %d, want 2", got)
	}

	// Server resends the same stream from scratch.
	if _, err := s.ApplyReceivedItems(0, []NetworkItem{{Item: 100}, {Item: 100}, {Item: 200}}); err != nil {
		t.Fatal(err)
	}
	if got := s.Count(100); got != 2 {
		t.Errorf("after resync Count(100) = %d, want 2 — items were double-counted", got)
	}
	if got := s.LastReceivedIndex; got != 3 {
		t.Errorf("LastReceivedIndex = %d, want 3", got)
	}
}

// A resync that returns FEWER items (e.g. the room was rolled back) must shrink state,
// which append-only logic would get wrong.
func TestResyncCanShrinkState(t *testing.T) {
	s := newTestSession(t)
	_, _ = s.ApplyReceivedItems(0, []NetworkItem{{Item: 1}, {Item: 1}, {Item: 1}})
	_, _ = s.ApplyReceivedItems(0, []NetworkItem{{Item: 1}})
	if got := s.Count(1); got != 1 {
		t.Errorf("Count(1) = %d after a shorter resync, want 1", got)
	}
}

func TestIncrementalAppendAndDuplicatePacket(t *testing.T) {
	s := newTestSession(t)

	_, _ = s.ApplyReceivedItems(0, []NetworkItem{{Item: 5}})
	applied, err := s.ApplyReceivedItems(1, []NetworkItem{{Item: 5}, {Item: 6}})
	if err != nil || !applied {
		t.Fatalf("append at the expected index failed: applied=%v err=%v", applied, err)
	}
	if s.Count(5) != 2 || s.Count(6) != 1 {
		t.Fatalf("counts after append: 5=%d 6=%d, want 2 and 1", s.Count(5), s.Count(6))
	}

	// A replayed packet must be ignored rather than applied twice.
	applied, err = s.ApplyReceivedItems(1, []NetworkItem{{Item: 5}, {Item: 6}})
	if err != nil {
		t.Fatalf("duplicate packet returned an error: %v", err)
	}
	if applied {
		t.Error("duplicate packet was applied")
	}
	if s.Count(5) != 2 {
		t.Errorf("Count(5) = %d after duplicate, want 2", s.Count(5))
	}
}

// A gap means a packet was missed. Applying it anyway would silently corrupt counts, so
// it must surface as an error the caller can turn into a resync request.
func TestIndexGapIsRejected(t *testing.T) {
	s := newTestSession(t)
	_, _ = s.ApplyReceivedItems(0, []NetworkItem{{Item: 1}})
	if _, err := s.ApplyReceivedItems(5, []NetworkItem{{Item: 2}}); err == nil {
		t.Error("expected an error for an index gap, got nil")
	}
	if s.Count(2) != 0 {
		t.Error("items from a gapped packet were applied")
	}
}

// REQUIREMENT: items may carry no attributed player or location (server grants, item
// links, !getitem). These are legitimate and must not be dropped.
func TestUnattributedItemsAreAccepted(t *testing.T) {
	s := newTestSession(t)
	_, err := s.ApplyReceivedItems(0, []NetworkItem{
		{Item: 42, Player: -1, Location: -1},
		{Item: 42, Player: 3, Location: 77},
	})
	if err != nil {
		t.Fatal(err)
	}
	if got := s.Count(42); got != 2 {
		t.Errorf("Count(42) = %d, want 2 — an unattributed item was dropped", got)
	}
}

// REQUIREMENT: an item may arrive far more often than the game expects. State records
// the true count; clamping belongs at the point of use (a skill level caps at 20).
func TestCountsAreNotClampedInState(t *testing.T) {
	s := newTestSession(t)
	items := make([]NetworkItem, 50)
	for i := range items {
		items[i] = NetworkItem{Item: 7}
	}
	if _, err := s.ApplyReceivedItems(0, items); err != nil {
		t.Fatal(err)
	}
	if got := s.Count(7); got != 50 {
		t.Errorf("Count(7) = %d, want 50 — state must not clamp", got)
	}
}

func TestGoalReportedOnce(t *testing.T) {
	dir := t.TempDir()
	s, _ := NewSession(dir, "r", "s")
	if s.GoalReported {
		t.Fatal("GoalReported should start false")
	}
	if err := s.MarkGoal(); err != nil {
		t.Fatal(err)
	}
	reloaded, _ := NewSession(dir, "r", "s")
	if !reloaded.GoalReported {
		t.Error("GoalReported did not survive a reload")
	}
}

func TestCorruptStateFileIsPreserved(t *testing.T) {
	dir := t.TempDir()
	s, _ := NewSession(dir, "room-1", "slot-1")
	if err := writeFile(s.path, "{not json"); err != nil {
		t.Fatal(err)
	}
	if _, err := NewSession(dir, "room-1", "slot-1"); err == nil {
		t.Fatal("silently discarded offline-only checks")
	}
	raw, _ := os.ReadFile(s.path)
	if string(raw) != "{not json" {
		t.Fatal("damaged state was overwritten")
	}
}

func TestSessionsAreIsolatedPerRoomAndSlot(t *testing.T) {
	dir := t.TempDir()
	a, _ := NewSession(dir, "room-1", "slot-1")
	b, _ := NewSession(dir, "room-1", "slot-2")
	_, _ = a.AddChecks([]int64{1, 2, 3})

	reloadedB, _ := NewSession(dir, "room-1", "slot-2")
	if len(reloadedB.AllChecks()) != 0 {
		t.Error("slot-2 saw slot-1's checks — state files collide")
	}
	_ = b
}

func TestSanitizeKeepsPathsSafe(t *testing.T) {
	for _, in := range []string{"../../etc/passwd", "a/b\\c", "", "room:1"} {
		got := sanitize(in)
		for _, r := range got {
			ok := (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') ||
				(r >= '0' && r <= '9') || r == '-' || r == '_'
			if !ok {
				t.Errorf("sanitize(%q) = %q contains an unsafe rune %q", in, got, r)
			}
		}
		if got == "" {
			t.Errorf("sanitize(%q) returned empty", in)
		}
	}
}

func writeFile(path, contents string) error {
	return os.WriteFile(path, []byte(contents), 0o644)
}
