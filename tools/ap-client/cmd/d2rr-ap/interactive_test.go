//go:build windows

package main

import "testing"

func TestRoomAddressesAPlayerMightPaste(t *testing.T) {
	for in, want := range map[string]struct {
		host string
		port int
	}{
		"archipelago.gg:38281":          {"archipelago.gg", 38281},
		"  archipelago.gg:51234  ":      {"archipelago.gg", 51234},
		"/connect archipelago.gg:40000": {"archipelago.gg", 40000},
		"wss://archipelago.gg:38281":    {"archipelago.gg", 38281},
		"ws://localhost:38282":          {"localhost", 38282},
		"localhost":                     {"localhost", 38281},
		"192.168.1.20:38281":            {"192.168.1.20", 38281},
	} {
		host, port, err := parseRoomAddress(in)
		if err != nil || host != want.host || port != want.port {
			t.Errorf("%q: got %s %d %v, want %s %d", in, host, port, err, want.host, want.port)
		}
	}
	for _, bad := range []string{"", "archipelago.gg:", "archipelago.gg:0", "archipelago.gg:99999", ":38281", "my name", "a/b:1"} {
		if _, _, err := parseRoomAddress(bad); err == nil {
			t.Errorf("accepted %q", bad)
		}
	}
}

func TestTheLastRoomIsRemembered(t *testing.T) {
	dir := t.TempDir()
	saveLastRoom(dir, roomChoice{Host: "archipelago.gg", Port: 40000, Slot: "Tester", password: "secret"})
	got := loadLastRoom(dir)
	if got.Host != "archipelago.gg" || got.Port != 40000 || got.Slot != "Tester" {
		t.Fatalf("got %+v", got)
	}
	if got.password != "" {
		t.Fatal("a password must never be saved")
	}
}
