//go:build windows

package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/Dune172/d2r-skill-randomizer/tools/ap-client/internal/apc"
)

func TestConsoleCommandsAreTheAppsOwn(t *testing.T) {
	for line, want := range map[string]consoleCommand{
		"/difficulty nightmare": {name: "difficulty", arg: "nightmare"},
		"  /Difficulty HELL ":   {name: "difficulty", arg: "hell"},
		"/difficulty":           {name: "difficulty"},
		"/help":                 {name: "help"},
	} {
		got, ok := parseConsoleCommand(line)
		if !ok || got != want {
			t.Errorf("%q: got %+v %v, want %+v", line, got, ok, want)
		}
	}
	// Server commands and chat go to the room.
	for _, line := range []string{"!hint Skill Point", "hello", "/connect host:1", ""} {
		if _, ok := parseConsoleCommand(line); ok {
			t.Errorf("%q was kept from the room", line)
		}
	}
}

func TestDifficultyArguments(t *testing.T) {
	for arg, want := range map[string]int{"normal": 0, "n": 0, "0": 0, "nightmare": 1, "nm": 1, "1": 1, "hell": 2, "h": 2, "2": 2, "auto": -1} {
		if got, err := parseDifficultyArg(arg); err != nil || got != want {
			t.Errorf("%q: got %d %v, want %d", arg, got, err, want)
		}
	}
	for _, bad := range []string{"", "3", "easy", "-2"} {
		if _, err := parseDifficultyArg(bad); err == nil {
			t.Errorf("accepted %q", bad)
		}
	}
}

func boundSession(t *testing.T, dir string) *apc.Session {
	t.Helper()
	s := apc.PendingSession(dir, "Slot")
	if err := s.Bind("generation", 0, 1); err != nil {
		t.Fatal(err)
	}
	return s
}

// /difficulty is kept per room and comes back after a restart; a choice beyond the
// room's goal is refused; auto clears it.
func TestDifficultyChoiceIsKeptForTheRoom(t *testing.T) {
	dir := t.TempDir()
	a := &app{session: boundSession(t, dir), goalDifficulty: 1, difficultyOverride: -1, difficultyFlag: -1}

	a.handleCommand(consoleCommand{name: "difficulty", arg: "hell"})
	if a.difficultyOverride != -1 {
		t.Fatal("accepted Hell in a room that ends on Nightmare")
	}
	a.handleCommand(consoleCommand{name: "difficulty", arg: "nightmare"})
	if a.difficultyOverride != 1 {
		t.Fatalf("override %d after /difficulty nightmare", a.difficultyOverride)
	}

	restarted := &app{session: boundSession(t, dir), goalDifficulty: 1, difficultyOverride: -1, difficultyFlag: -1}
	restarted.handleCommand(consoleCommand{name: "connected"})
	if restarted.difficultyOverride != 1 {
		t.Fatalf("after a restart the choice is %d", restarted.difficultyOverride)
	}
	restarted.handleCommand(consoleCommand{name: "difficulty", arg: "auto"})
	if restarted.difficultyOverride != -1 || restarted.session.DifficultyChoice() != -1 {
		t.Fatal("/difficulty auto did not clear the choice")
	}
}

func TestDifficultyFlagWinsOverACommand(t *testing.T) {
	a := &app{session: boundSession(t, t.TempDir()), goalDifficulty: 2, difficultyOverride: 2, difficultyFlag: 2}
	a.handleCommand(consoleCommand{name: "difficulty", arg: "normal"})
	if a.difficultyOverride != 2 {
		t.Fatal("/difficulty overrode -difficulty")
	}
}

// Ten deaths received while away are one death, and an old one is dropped.
func TestDeathLinkDeathsDoNotPileUp(t *testing.T) {
	a := &app{}
	for i := 0; i < 10; i++ {
		a.queueDeath()
	}
	if a.pendingDeaths != 1 {
		t.Fatalf("%d deaths pending", a.pendingDeaths)
	}
	a.deathQueuedAt = time.Now().Add(-2 * deathMaxAge)
	a.applyIncomingDeath(1)
	if a.pendingDeaths != 0 {
		t.Fatal("a stale death was carried out")
	}
}

func TestOldLogFilesAreRemoved(t *testing.T) {
	dir := t.TempDir()
	for i := 0; i < 15; i++ {
		os.WriteFile(filepath.Join(dir, fmt.Sprintf("d2rr-ap-20261101-1200%02d.log", i)), nil, 0o644)
	}
	pruneLogs(dir, 10)
	left, _ := filepath.Glob(filepath.Join(dir, "*.log"))
	if len(left) != 10 || !strings.HasSuffix(left[0], "120005.log") {
		t.Fatalf("kept %v", left)
	}
}

// A refused name is not remembered; the game folder is, at once.
func TestTheRoomIsRememberedOnlyOnceAccepted(t *testing.T) {
	dir := t.TempDir()
	game := t.TempDir() // a game folder, so the test runs where D2R is not installed
	os.WriteFile(filepath.Join(game, "D2R.exe"), nil, 0o644)
	saveLastRoom(dir, roomChoice{Host: "old.example", Port: 1, Slot: "Good", GameDir: game})
	consoleInput = strings.NewReader("new.example:2\nTypo\n\n")
	choice, err := askRoom(dir, nil)
	if err != nil {
		t.Fatal(err)
	}
	if choice.Slot != "Typo" || choice.Host != "new.example" {
		t.Fatalf("choice %+v", choice)
	}
	if got := loadLastRoom(dir); got.Slot != "Good" || got.Host != "old.example" {
		t.Fatalf("remembered %+v before the room accepted it", got)
	}
	rememberRoom(dir, choice)
	if got := loadLastRoom(dir); got.Slot != "Typo" {
		t.Fatalf("not remembered once accepted: %+v", got)
	}
}
