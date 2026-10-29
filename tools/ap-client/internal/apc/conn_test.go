package apc

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"github.com/coder/websocket"
)

// fakeServer is a minimal Archipelago server: enough of the protocol to drive a real
// handshake against the real transport. Nothing here is mocked at the client boundary —
// Conn dials a genuine websocket and parses genuine packets.
type fakeServer struct {
	*httptest.Server
	received chan map[string]any // packets the client sent us
	script   func(ctx context.Context, send func(...map[string]any) error, got map[string]any) error
}

func newFakeServer(t *testing.T, script func(ctx context.Context, send func(...map[string]any) error, got map[string]any) error) *fakeServer {
	t.Helper()
	fs := &fakeServer{received: make(chan map[string]any, 64), script: script}

	fs.Server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ws, err := websocket.Accept(w, r, &websocket.AcceptOptions{InsecureSkipVerify: true})
		if err != nil {
			return
		}
		defer ws.CloseNow()
		ctx := r.Context()

		send := func(packets ...map[string]any) error {
			data, err := json.Marshal(packets)
			if err != nil {
				return err
			}
			return ws.Write(ctx, websocket.MessageText, data)
		}

		// Archipelago opens with RoomInfo.
		if err := send(map[string]any{"cmd": "RoomInfo", "seed_name": "test-generation"}); err != nil {
			return
		}

		for {
			_, data, err := ws.Read(ctx)
			if err != nil {
				return
			}
			var packets []map[string]any
			if err := json.Unmarshal(data, &packets); err != nil {
				return
			}
			for _, p := range packets {
				select {
				case fs.received <- p:
				default:
				}
				if fs.script != nil {
					if err := fs.script(ctx, send, p); err != nil {
						return
					}
				}
			}
		}
	}))
	t.Cleanup(fs.Close)
	return fs
}

func (fs *fakeServer) hostPort(t *testing.T) (string, int) {
	t.Helper()
	host, portStr, err := net.SplitHostPort(fs.Listener.Addr().String())
	if err != nil {
		t.Fatalf("SplitHostPort: %v", err)
	}
	port, err := strconv.Atoi(portStr)
	if err != nil {
		t.Fatalf("Atoi: %v", err)
	}
	return host, port
}

// waitFor drains packets until one matching cmd arrives, or the deadline passes.
func (fs *fakeServer) waitFor(t *testing.T, cmd string, timeout time.Duration) map[string]any {
	t.Helper()
	deadline := time.After(timeout)
	for {
		select {
		case p := <-fs.received:
			if p["cmd"] == cmd {
				return p
			}
		case <-deadline:
			t.Fatalf("timed out waiting for a %q packet from the client", cmd)
			return nil
		}
	}
}

// The full handshake against a real socket: RoomInfo -> Connect -> Connected ->
// LocationChecks -> ReceivedItems. This is the path that only ever runs against a live
// server otherwise, which is exactly why it is worth pinning here.
func TestHandshakeAndItemDelivery(t *testing.T) {
	fs := newFakeServer(t, func(ctx context.Context, send func(...map[string]any) error, got map[string]any) error {
		if got["cmd"] == "Connect" {
			return send(map[string]any{
				"cmd":  "Connected",
				"team": float64(0), "slot": float64(1),
				"slot_data":         map[string]any{"contract_version": float64(SlotContractVersion), "fragments_per_point": float64(5), "d2rr_seed": float64(1234), "character_class": "pal"},
				"checked_locations": []any{float64(500)},
			}, map[string]any{
				"cmd":   "ReceivedItems",
				"index": float64(0),
				"items": []any{
					map[string]any{"item": float64(9001), "player": float64(-1), "location": float64(-1)},
					map[string]any{"item": float64(9001), "player": float64(2), "location": float64(77)},
				},
			})
		}
		return nil
	})

	host, port := fs.hostPort(t)
	session := PendingSession(t.TempDir(), "slot")
	if err := session.Bind("test-generation", 0, 1); err != nil {
		t.Fatal(err)
	}

	// A check made BEFORE connecting: it must reach the server on connect.
	if _, err := session.AddChecks([]int64{42}); err != nil {
		t.Fatal(err)
	}

	gotSlotData := make(chan map[string]any, 1)
	gotItems := make(chan struct{}, 4)
	conn := NewConn(host, port, "TestSlot", "", session, Handler{
		OnConnected: func(slotData map[string]any, _ []int64) { gotSlotData <- slotData },
		OnItems:     func(*Session) { gotItems <- struct{}{} },
	})

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go conn.Run(ctx)

	// The client must announce itself with the right game name.
	connectPkt := fs.waitFor(t, "Connect", 10*time.Second)
	if connectPkt["game"] != GameName {
		t.Errorf("Connect game = %v, want %q", connectPkt["game"], GameName)
	}
	if connectPkt["name"] != "TestSlot" {
		t.Errorf("Connect name = %v, want TestSlot", connectPkt["name"])
	}
	if h, _ := toInt64(connectPkt["items_handling"]); h != itemsHandlingAll {
		t.Errorf("items_handling = %v, want %d (all items)", connectPkt["items_handling"], itemsHandlingAll)
	}

	// REQUIREMENT: the offline check must be sent on connect, and the send must be the
	// FULL set (ours plus the server's), not a delta.
	checks := fs.waitFor(t, "LocationChecks", 10*time.Second)
	sent := map[int64]bool{}
	for _, v := range toSlice(checks["locations"]) {
		if n, ok := toInt64(v); ok {
			sent[n] = true
		}
	}
	if !sent[42] {
		t.Error("the offline check (42) was not sent on connect — it would be lost forever")
	}
	if !sent[500] {
		t.Error("the server's own checked location (500) was not echoed back in the full set")
	}

	select {
	case sd := <-gotSlotData:
		if sd["character_class"] != "pal" {
			t.Errorf("slot_data character_class = %v, want pal", sd["character_class"])
		}
	case <-time.After(10 * time.Second):
		t.Fatal("OnConnected never fired")
	}

	select {
	case <-gotItems:
	case <-time.After(10 * time.Second):
		t.Fatal("OnItems never fired")
	}

	// Both copies counted, including the unattributed one.
	if got := session.Count(9001); got != 2 {
		t.Errorf("Count(9001) = %d, want 2 (an unattributed item was dropped)", got)
	}
}

// A refused connection must surface rather than spin silently.
func TestConnectionRefusedSurfaces(t *testing.T) {
	fs := newFakeServer(t, func(ctx context.Context, send func(...map[string]any) error, got map[string]any) error {
		if got["cmd"] == "Connect" {
			return send(map[string]any{
				"cmd":    "ConnectionRefused",
				"errors": []any{"InvalidSlot"},
			})
		}
		return nil
	})

	host, port := fs.hostPort(t)
	session, _ := NewSession(t.TempDir(), "room", "slot")

	msgs := make(chan string, 16)
	conn := NewConn(host, port, "WrongSlot", "", session, Handler{
		OnPrint: func(s string) {
			select {
			case msgs <- s:
			default:
			}
		},
	})

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go conn.Run(ctx)

	deadline := time.After(15 * time.Second)
	for {
		select {
		case m := <-msgs:
			if contains(m, "InvalidSlot") {
				return // reported, as required
			}
		case <-deadline:
			t.Fatal("ConnectionRefused was never surfaced to the user")
		}
	}
}

// Dial must fall back from wss:// to ws://: hosted rooms are TLS, self-hosted ones
// usually are not, and supporting only one breaks half of all users.
func TestDialFallsBackToInsecure(t *testing.T) {
	fs := newFakeServer(t, nil) // plain HTTP, so wss:// cannot succeed
	host, port := fs.hostPort(t)
	session, _ := NewSession(t.TempDir(), "room", "slot")

	conn := NewConn(host, port, "S", "", session, Handler{})
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	ws, err := conn.dial(ctx)
	if err != nil {
		t.Fatalf("dial did not fall back to ws://: %v", err)
	}
	ws.CloseNow()
}

func TestSendWhileDisconnectedIsAnError(t *testing.T) {
	session, _ := NewSession(t.TempDir(), "room", "slot")
	conn := NewConn("127.0.0.1", 1, "S", "", session, Handler{})
	if err := conn.SendChecks(context.Background(), []int64{1}); err == nil {
		t.Error("expected an error when sending while disconnected")
	}
	if conn.Connected() {
		t.Error("Connected() true before any connection")
	}
}

func TestIncompatibleRoomDoesNotApplyChecksOrPrepareMod(t *testing.T) {
	for _, version := range []any{nil, float64(1), float64(2), float64(3), 4.5, "4"} {
		t.Run(fmt.Sprint(version), func(t *testing.T) {
			session, _ := NewSession(t.TempDir(), "room", "slot")
			called := false
			conn := NewConn("127.0.0.1", 1, "S", "", session, Handler{
				OnConnected: func(map[string]any, []int64) { called = true },
			})
			err := conn.handle(context.Background(), map[string]any{
				"cmd":  "Connected",
				"team": float64(0), "slot": float64(1),
				"slot_data":         map[string]any{"contract_version": version},
				"checked_locations": []any{float64(5721000)},
			})
			if err == nil || !contains(err.Error(), "generate a new room") {
				t.Fatalf("expected actionable compatibility error, got %v", err)
			}
			if called || len(session.AllChecks()) != 0 {
				t.Fatal("incompatible room changed session state or prepared a mod")
			}
		})
	}
}

func contains(s, sub string) bool {
	return len(s) >= len(sub) && (func() bool {
		for i := 0; i+len(sub) <= len(s); i++ {
			if s[i:i+len(sub)] == sub {
				return true
			}
		}
		return false
	})()
}

func TestRecordedGoalIsReplayedOnConnection(t *testing.T) {
	fs := newFakeServer(t, func(ctx context.Context, send func(...map[string]any) error, got map[string]any) error {
		if got["cmd"] == "Connect" {
			return send(map[string]any{"cmd": "Connected", "team": 0, "slot": 1,
				"slot_data": map[string]any{"contract_version": SlotContractVersion, "fragments_per_point": 5}})
		}
		return nil
	})
	dir := t.TempDir()
	original := PendingSession(dir, "Slot")
	if err := original.Bind("test-generation", 0, 1); err != nil {
		t.Fatal(err)
	}
	if err := original.MarkGoal(); err != nil {
		t.Fatal(err)
	}
	host, port := fs.hostPort(t)
	for i := 0; i < 2; i++ {
		session := PendingSession(dir, "Slot")
		conn := NewConn(host, port, "Slot", "", session, Handler{})
		ctx, cancel := context.WithCancel(context.Background())
		done := make(chan struct{})
		go func() { defer close(done); conn.Run(ctx) }()
		got := fs.waitFor(t, "StatusUpdate", 3*time.Second)
		cancel()
		<-done
		if got["status"] != float64(clientGoal) {
			t.Fatalf("wrong goal packet: %v", got)
		}
	}
}
