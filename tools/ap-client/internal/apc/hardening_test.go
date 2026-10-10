package apc

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestGenerationIdentityIsolation(t *testing.T) {
	dir := t.TempDir()
	first := PendingSession(dir, "Player")
	if e := first.Bind("seed-one", 0, 1); e != nil {
		t.Fatal(e)
	}
	first.AddChecks([]int64{10})
	first.ApplyReceivedItems(0, []NetworkItem{{Item: 42}})
	first.MarkGoal()
	first.BindCharacter("Hero")
	same := PendingSession(dir, "Player")
	if e := same.Bind("seed-one", 0, 1); e != nil {
		t.Fatal(e)
	}
	if len(same.AllChecks()) != 1 || same.Count(42) != 1 || !same.HasGoal() || same.CharacterName() != "Hero" {
		t.Fatal("same generation lost state")
	}
	for _, v := range []struct {
		seed       string
		team, slot int64
	}{{"seed-two", 0, 1}, {"seed-one", 1, 1}, {"seed-one", 0, 2}} {
		other := PendingSession(dir, "Player")
		if e := other.Bind(v.seed, v.team, v.slot); e != nil {
			t.Fatal(e)
		}
		if len(other.AllChecks()) != 0 || other.HasGoal() || other.Count(42) != 0 || other.CharacterName() != "" {
			t.Fatal("state crossed identities")
		}
	}
	if e := same.Bind("seed-two", 0, 1); e == nil {
		t.Fatal("live identity switch accepted")
	}
	if e := same.BindCharacter("Other"); e == nil {
		t.Fatal("character switch accepted")
	}
}
func TestStateFilenamesCannotCollideThroughSanitizing(t *testing.T) {
	dir := t.TempDir()
	for _, pair := range [][2]string{{"a:b", "a/b"}, {strings.Repeat("x", 60) + "a", strings.Repeat("x", 60) + "b"}} {
		a, _ := NewSession(dir, pair[0], "slot")
		b, _ := NewSession(dir, pair[1], "slot")
		if a.path == b.path {
			t.Fatal("filename collision")
		}
	}
}
func TestOverlappingItemsKeepUnseenTail(t *testing.T) {
	s := newTestSession(t)
	s.ApplyReceivedItems(0, []NetworkItem{{Item: 1}, {Item: 2}})
	if ok, e := s.ApplyReceivedItems(1, []NetworkItem{{Item: 2}, {Item: 3}}); e != nil || !ok {
		t.Fatalf("%v %v", ok, e)
	}
	if s.Count(1) != 1 || s.Count(2) != 1 || s.Count(3) != 1 || s.LastReceivedIndex != 3 {
		t.Fatal("overlap lost or duplicated items")
	}
}
func TestPersistenceFailureIsRetryable(t *testing.T) {
	s := newTestSession(t)
	path := s.path
	s.path = filepath.Join(t.TempDir(), "missing", "state.json")
	if _, e := s.AddChecks([]int64{1}); e == nil {
		t.Fatal("expected write failure")
	}
	if len(s.AllChecks()) != 0 {
		t.Fatal("failed check write advanced state")
	}
	if _, e := s.ApplyReceivedItems(0, []NetworkItem{{Item: 1}}); e == nil {
		t.Fatal("expected write failure")
	}
	if s.Count(1) != 0 || s.LastReceivedIndex != 0 {
		t.Fatal("failed item write advanced state")
	}
	if e := s.MarkGoal(); e == nil {
		t.Fatal("expected write failure")
	}
	if s.HasGoal() {
		t.Fatal("failed goal write advanced state")
	}
	s.path = path
	if _, e := s.AddChecks([]int64{1}); e != nil {
		t.Fatal(e)
	}
	if _, e := s.ApplyReceivedItems(0, []NetworkItem{{Item: 1}}); e != nil {
		t.Fatal(e)
	}
	if _, e := os.Stat(path + ".bak"); e != nil {
		t.Fatal("no backup", e)
	}
}
func TestItemsBeforeAuthenticationAreRejected(t *testing.T) {
	s := PendingSession(t.TempDir(), "Player")
	c := NewConn("localhost", 1, "Player", "", s, Handler{})
	e := c.handle(context.Background(), map[string]any{"cmd": "ReceivedItems", "index": float64(0), "items": []any{}})
	if e == nil || s.LastReceivedIndex != 0 {
		t.Fatal("unauthenticated item stream accepted")
	}
}

func TestSlotAliasChangeDoesNotLoseBinding(t *testing.T) {
	dir := t.TempDir()
	a := PendingSession(dir, "Original")
	if e := a.Bind("generation", 0, 1); e != nil {
		t.Fatal(e)
	}
	a.BindCharacter("Hero")
	b := PendingSession(dir, "Alias")
	if e := b.Bind("generation", 0, 1); e != nil {
		t.Fatal(e)
	}
	if b.CharacterName() != "Hero" {
		t.Fatal("alias changed canonical slot identity")
	}
}
func TestResyncPausesWritesUntilAppConsumesCounts(t *testing.T) {
	s := PendingSession(t.TempDir(), "Slot")
	s.Bind("seed", 0, 1)
	var c *Conn
	c = NewConn("localhost", 1, "Slot", "", s, Handler{OnItems: func(*Session) {
		if c.Synchronized() {
			t.Error("writes enabled before app consumed resync")
		}
	}})
	c.open = true
	c.authenticated = true
	c.synchronized = true
	if e := c.handle(context.Background(), map[string]any{"cmd": "ReceivedItems", "index": float64(0), "items": []any{}}); e != nil {
		t.Fatal(e)
	}
	if !c.Synchronized() {
		t.Fatal("writes not restored after successful replay")
	}
}
