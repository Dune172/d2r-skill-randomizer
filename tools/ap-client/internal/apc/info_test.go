package apc

import (
	"context"
	"testing"
)

func TestReceivedLogFollowsTheServersNumbering(t *testing.T) {
	c := &Conn{slot: 1}
	c.names = *roomNames()
	a := NetworkItem{Item: 100, Player: 2, Location: 5}
	b := NetworkItem{Item: 100, Player: 1, Location: 5}
	c.logReceived(0, []NetworkItem{a})
	c.logReceived(1, []NetworkItem{b})
	c.logReceived(1, []NetworkItem{b}) // a repeat adds nothing
	c.logReceived(5, []NetworkItem{a}) // a gap waits for the replay
	got := c.Received()
	if len(got) != 2 || got[0].From != "Link" || got[1].From != "" || got[1].Location != "Normal A1: Den of Evil" {
		t.Fatalf("%+v", got)
	}
	c.logReceived(0, []NetworkItem{b}) // a full replay starts over
	if len(c.Received()) != 1 {
		t.Fatal("a replay from 0 did not replace the list")
	}
}

func TestHintLinesReadStoredHints(t *testing.T) {
	c := &Conn{slot: 1}
	c.names = *roomNames()
	lines := c.hintLines([]any{
		map[string]any{"receiving_player": float64(1), "finding_player": float64(2), "item": float64(100), "location": float64(9), "found": false},
		map[string]any{"receiving_player": float64(2), "finding_player": float64(1), "item": float64(7), "location": float64(5), "found": true},
		map[string]any{"bad": true},
	})
	if len(lines) != 2 || lines[0].Found || !lines[1].Found {
		t.Fatalf("%+v", lines)
	}
}

func TestMissingShrinksAsChecksAreSentOrReported(t *testing.T) {
	c := &Conn{locations: map[int64]bool{1: true, 2: true, 3: true}, missing: map[int64]bool{2: true, 3: true}}
	_ = c.SendChecks(context.Background(), []int64{2}) // not connected: the send fails, the list still shrinks
	if err := c.handle(context.Background(), map[string]any{"cmd": "RoomUpdate", "checked_locations": []any{float64(3)}}); err != nil {
		t.Fatal(err)
	}
	all, missing, ok := c.Progress()
	if !ok || len(all) != 3 || len(missing) != 0 {
		t.Fatalf("all %v missing %v", all, missing)
	}
}
