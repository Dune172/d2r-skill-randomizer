package apc

import (
	"context"
	"strings"
	"sync"
	"testing"
	"time"
)

func validSlotData() map[string]any {
	return map[string]any{"contract_version": float64(SlotContractVersion), "fragments_per_point": float64(5)}
}

// startConn runs a Conn against a fake server until the test ends.
func startConn(t *testing.T, fs *fakeServer, h Handler) (*Conn, *Session) {
	t.Helper()
	host, port := fs.hostPort(t)
	session := PendingSession(t.TempDir(), "Slot")
	conn := NewConn(host, port, "Slot", "", session, h)
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	go conn.Run(ctx)
	return conn, session
}

func waitUntil(t *testing.T, what string, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for !cond() {
		if time.Now().After(deadline) {
			t.Fatalf("timed out waiting for %s", what)
		}
		time.Sleep(5 * time.Millisecond)
	}
}

// A missed packet must be answered with Sync and a resend of our checks, on the same
// connection, and nothing may be written to the game until the replay arrives.
func TestItemGapAsksForSyncInsteadOfDroppingTheConnection(t *testing.T) {
	item := func(id float64) map[string]any {
		return map[string]any{"item": id, "player": float64(1), "location": float64(1)}
	}
	fs := newFakeServer(t, func(ctx context.Context, send func(...map[string]any) error, got map[string]any) error {
		switch got["cmd"] {
		case "Connect":
			return send(
				map[string]any{"cmd": "Connected", "team": float64(0), "slot": float64(1), "slot_data": validSlotData()},
				map[string]any{"cmd": "ReceivedItems", "index": float64(0), "items": []any{item(7)}},
				// Index 3 after one item: two were missed.
				map[string]any{"cmd": "ReceivedItems", "index": float64(3), "items": []any{item(9)}},
			)
		case "Sync":
			return send(map[string]any{"cmd": "ReceivedItems", "index": float64(0), "items": []any{item(7), item(8), item(8), item(9)}})
		}
		return nil
	})
	conn, session := startConn(t, fs, Handler{})

	fs.waitFor(t, "Connect", 5*time.Second)
	fs.waitFor(t, "Sync", 5*time.Second)
	waitUntil(t, "the replay", func() bool { return session.Count(8) == 2 })
	if session.Count(7) != 1 || session.Count(9) != 1 {
		t.Fatalf("counts after resync: 7=%d 9=%d", session.Count(7), session.Count(9))
	}
	waitUntil(t, "writes to be enabled again", conn.Synchronized)
	if !conn.Connected() {
		t.Fatal("the gap dropped the connection")
	}
}

func TestOnlyLocationsTheRoomHasAreKnown(t *testing.T) {
	fs := newFakeServer(t, func(ctx context.Context, send func(...map[string]any) error, got map[string]any) error {
		if got["cmd"] == "Connect" {
			return send(map[string]any{
				"cmd": "Connected", "team": float64(0), "slot": float64(1), "slot_data": validSlotData(),
				"checked_locations": []any{float64(10)}, "missing_locations": []any{float64(11), float64(12)},
			})
		}
		return nil
	})
	conn, _ := startConn(t, fs, Handler{})
	if !conn.KnownLocation(999) {
		t.Fatal("before the room has spoken, nothing may be filtered out")
	}
	waitUntil(t, "authentication", conn.Connected)
	for id, want := range map[int64]bool{10: true, 11: true, 12: true, 13: false, 999: false} {
		if conn.KnownLocation(id) != want {
			t.Errorf("KnownLocation(%d) = %v, want %v", id, !want, want)
		}
	}
}

func TestMessagesNameThePlayersItemsAndLocations(t *testing.T) {
	var mu sync.Mutex
	var printed []string
	fs := newFakeServer(t, func(ctx context.Context, send func(...map[string]any) error, got map[string]any) error {
		switch got["cmd"] {
		case "Connect":
			return send(map[string]any{
				"cmd": "Connected", "team": float64(0), "slot": float64(1), "slot_data": validSlotData(),
				"players": []any{
					map[string]any{"team": float64(0), "slot": float64(1), "alias": "Me", "name": "Me"},
					map[string]any{"team": float64(0), "slot": float64(2), "alias": "Alice", "name": "Alice"},
					map[string]any{"team": float64(1), "slot": float64(2), "alias": "OtherTeam", "name": "x"},
				},
				"slot_info": map[string]any{
					"1": map[string]any{"name": "Me", "game": "D2R Randomizer"},
					"2": map[string]any{"name": "Alice", "game": "Other Game"},
				},
			}, map[string]any{"cmd": "DataPackage", "data": map[string]any{"games": map[string]any{
				"D2R Randomizer": map[string]any{"checksum": "aa", "item_name_to_id": map[string]any{"Zod Rune": float64(5)}, "location_name_to_id": map[string]any{}},
				// The same ids mean something else in another game.
				"Other Game": map[string]any{"checksum": "bb", "item_name_to_id": map[string]any{"Wrong": float64(5)}, "location_name_to_id": map[string]any{"Deep Cave": float64(5)}},
			}}}, map[string]any{"cmd": "PrintJSON", "data": []any{
				map[string]any{"text": "2", "type": "player_id"},
				map[string]any{"text": " sent "},
				map[string]any{"text": "5", "type": "item_id", "player": float64(1)},
				map[string]any{"text": " to "},
				map[string]any{"text": "1", "type": "player_id"},
				map[string]any{"text": " ("},
				map[string]any{"text": "5", "type": "location_id", "player": float64(2)},
				map[string]any{"text": ")"},
			}})
		}
		return nil
	})
	startConn(t, fs, Handler{OnPrint: func(s string) {
		mu.Lock()
		printed = append(printed, s)
		mu.Unlock()
	}})
	want := "Alice sent Zod Rune to Me (Deep Cave)"
	waitUntil(t, "the message", func() bool {
		mu.Lock()
		defer mu.Unlock()
		for _, line := range printed {
			if line == want {
				return true
			}
		}
		return false
	})
}

func TestDeathLinkTagsBouncesAndIgnoresItsOwnEcho(t *testing.T) {
	var mu sync.Mutex
	var deaths []string
	fs := newFakeServer(t, func(ctx context.Context, send func(...map[string]any) error, got map[string]any) error {
		switch got["cmd"] {
		case "Connect":
			return send(map[string]any{"cmd": "Connected", "team": float64(0), "slot": float64(1), "slot_data": validSlotData()})
		case "Bounce":
			// The server sends a bounce to everyone with the tag, the sender included.
			echo := map[string]any{"cmd": "Bounced", "tags": got["tags"], "data": got["data"]}
			other := map[string]any{"cmd": "Bounced", "tags": []any{"DeathLink"}, "data": map[string]any{"time": float64(1), "source": "Alice", "cause": "Alice fell"}}
			unrelated := map[string]any{"cmd": "Bounced", "tags": []any{"SomethingElse"}, "data": map[string]any{"time": float64(2), "source": "Bob"}}
			return send(echo, other, unrelated)
		}
		return nil
	})
	conn, _ := startConn(t, fs, Handler{OnDeathLink: func(source, cause string) {
		mu.Lock()
		deaths = append(deaths, source+": "+cause)
		mu.Unlock()
	}})
	conn.EnableDeathLink()

	if tags := fs.waitFor(t, "ConnectUpdate", 5*time.Second)["tags"]; !hasTag(tags, "DeathLink") {
		t.Fatalf("ConnectUpdate tags %v", tags)
	}
	if err := conn.SendDeath(context.Background(), "Slot died"); err != nil {
		t.Fatal(err)
	}
	bounce := fs.waitFor(t, "Bounce", 5*time.Second)
	data, _ := bounce["data"].(map[string]any)
	if data["source"] != "Slot" || data["cause"] != "Slot died" || !hasTag(bounce["tags"], "DeathLink") {
		t.Fatalf("bounce %v", bounce)
	}
	waitUntil(t, "Alice's death", func() bool { mu.Lock(); defer mu.Unlock(); return len(deaths) > 0 })
	time.Sleep(50 * time.Millisecond)
	mu.Lock()
	defer mu.Unlock()
	if len(deaths) != 1 || deaths[0] != "Alice: Alice fell" {
		t.Fatalf("deaths acted on: %v", deaths)
	}
}

func TestDeathsAreNotSentOrReceivedWithoutDeathLink(t *testing.T) {
	fs := newFakeServer(t, func(ctx context.Context, send func(...map[string]any) error, got map[string]any) error {
		if got["cmd"] == "Connect" {
			return send(
				map[string]any{"cmd": "Connected", "team": float64(0), "slot": float64(1), "slot_data": validSlotData()},
				map[string]any{"cmd": "Bounced", "tags": []any{"DeathLink"}, "data": map[string]any{"time": float64(1), "source": "Alice"}},
				map[string]any{"cmd": "ReceivedItems", "index": float64(0), "items": []any{}},
			)
		}
		return nil
	})
	called := false
	conn, _ := startConn(t, fs, Handler{OnDeathLink: func(string, string) { called = true }})
	waitUntil(t, "the item replay", conn.Synchronized)
	if err := conn.SendDeath(context.Background(), "x"); err != nil {
		t.Fatal(err)
	}
	time.Sleep(50 * time.Millisecond)
	if called {
		t.Fatal("a death was acted on although DeathLink is off")
	}
	select {
	case p := <-fs.received:
		if p["cmd"] == "Bounce" || p["cmd"] == "ConnectUpdate" {
			t.Fatalf("sent %v although DeathLink is off", p["cmd"])
		}
	default:
	}
}

func TestClientIDIsStableAndIsNotTheSlotName(t *testing.T) {
	dir := t.TempDir()
	first := clientUUID(dir, "Slot")
	if first == "Slot" || len(first) != 32 || strings.Trim(first, "0123456789abcdef") != "" {
		t.Fatalf("client id %q", first)
	}
	if again := clientUUID(dir, "Other"); again != first {
		t.Fatalf("client id changed: %q then %q", first, again)
	}
	if other := clientUUID(t.TempDir(), "Slot"); other == first {
		t.Fatal("two installations share a client id")
	}
}

func TestOneShotItemsAreOwedUntilApplied(t *testing.T) {
	dir := t.TempDir()
	s := PendingSession(dir, "Slot")
	if err := s.Bind("seed", 0, 1); err != nil {
		t.Fatal(err)
	}
	s.ApplyReceivedItems(0, []NetworkItem{{Item: 5}, {Item: 5}, {Item: 6}})
	if s.Pending(5) != 2 || s.Pending(6) != 1 || s.Pending(7) != 0 {
		t.Fatalf("pending %d %d %d", s.Pending(5), s.Pending(6), s.Pending(7))
	}
	if err := s.MarkApplied(5, 1); err != nil {
		t.Fatal(err)
	}
	// A full resync rebuilds the counts; what was applied must not be owed again.
	s.ApplyReceivedItems(0, []NetworkItem{{Item: 5}, {Item: 5}, {Item: 6}})
	if s.Pending(5) != 1 {
		t.Fatalf("pending after resync %d", s.Pending(5))
	}
	// And it survives a restart.
	again := PendingSession(dir, "Slot")
	if err := again.Bind("seed", 0, 1); err != nil {
		t.Fatal(err)
	}
	if again.Pending(5) != 1 || again.Pending(6) != 1 {
		t.Fatalf("pending after restart %d %d", again.Pending(5), again.Pending(6))
	}
	// A rolled-back room can hold fewer than were applied: never negative.
	again.ApplyReceivedItems(0, nil)
	if again.Pending(5) != 0 {
		t.Fatalf("pending after rollback %d", again.Pending(5))
	}
}
