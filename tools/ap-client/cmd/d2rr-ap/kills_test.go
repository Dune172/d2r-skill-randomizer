//go:build windows

package main

import (
	"testing"

	"github.com/Dune172/d2r-skill-randomizer/tools/ap-client/internal/game"
	"github.com/Dune172/d2r-skill-randomizer/tools/ap-client/internal/ids"
)

func TestKillChecksNeedADeadSuperUniqueInItsArea(t *testing.T) {
	a := &app{lastSeen: map[string]bool{}}
	const superUnique, unique = 10, 8
	bishibosh := game.MonsterUnit{Txt: 58, TypeFlags: superUnique, Mode: 12, Corpse: true}
	units := []game.MonsterUnit{
		{Txt: 58, TypeFlags: superUnique, Mode: 1},                 // alive
		{Txt: 58, TypeFlags: unique, Mode: 12, Corpse: true},       // a unique shaman, not him
		{Txt: 58, Mode: 12, Corpse: true},                          // an ordinary shaman
		{Txt: 365, TypeFlags: superUnique, Mode: 12, Corpse: true}, // Griswold's class, wrong area
		bishibosh,
	}
	got := a.killChecks(units, 3, 1) // Cold Plains, Nightmare
	want, _ := ids.KillLocationID(1, 1)
	if len(got) != 1 || got[0] != want {
		t.Fatalf("got %v, want [%d]", got, want)
	}
	if again := a.killChecks([]game.MonsterUnit{bishibosh}, 3, 1); len(again) != 0 {
		t.Fatal("the same kill was checked twice")
	}
	// The same corpse seen elsewhere (another area id) is not Bishibosh.
	if other := a.killChecks([]game.MonsterUnit{bishibosh}, 4, 0); len(other) != 0 {
		t.Fatalf("checked in the wrong area: %v", other)
	}
	// Ancient Kaa counts in any of the seven tombs.
	kaa := game.MonsterUnit{Txt: 103, TypeFlags: superUnique, Mode: 0}
	if got := a.killChecks([]game.MonsterUnit{kaa}, 70, 0); len(got) != 1 {
		t.Fatal("Ancient Kaa in a tomb was not checked")
	}
}

func TestSlotDataSwitchesKillsOn(t *testing.T) {
	a := &app{session: boundSession(t, t.TempDir())}
	a.applySlotData(map[string]any{"goal_difficulty": float64(0), "include_super_uniques": true})
	if !a.includeSuperUniques {
		t.Fatal("include_super_uniques was not read")
	}
	a.applySlotData(map[string]any{"goal_difficulty": float64(0)})
	if a.includeSuperUniques {
		t.Fatal("kills on without the room asking")
	}
}
