//go:build windows

package main

import (
	"testing"

	"github.com/swannysoft/d2rr-ap-client/internal/ids"
)

func slotApp() *app {
	return &app{goalDifficulty: -1, goalAct: len(ids.GoalQuestIndex) - 1}
}

func TestSlotDataSetsTheRoomsOptions(t *testing.T) {
	a := slotApp()
	slotData := map[string]any{
		"goal_difficulty":          float64(1),
		"goal_act":                 float64(2),
		"include_waypoints":        false,
		"include_areas":            float64(0), // a Python bool sent as a number
		"include_level_milestones": true,
		"level_cap":                float64(40),
		"stat_points_pooled":       float64(1),
		"horadric_keys":            float64(2),
		"death_link":               true,
	}
	if !a.applySlotData(slotData) {
		t.Fatal("death_link true must ask for DeathLink")
	}
	if a.goalDifficulty != 1 || a.goalAct != 2 {
		t.Fatalf("goal %d/%d, want Mephisto on Nightmare", a.goalDifficulty, a.goalAct)
	}
	if a.includeWaypoints || a.includeAreas || !a.includeLevels {
		t.Fatalf("check groups %v %v %v", a.includeWaypoints, a.includeAreas, a.includeLevels)
	}
	if a.levelCap != 40 || !a.statPointsPooled || !a.keyItems || !a.deathLink {
		t.Fatalf("cap %d pooled %v keys %v deathlink %v", a.levelCap, a.statPointsPooled, a.keyItems, a.deathLink)
	}
	if a.slotData == nil {
		t.Fatal("slot_data must be kept for the mod fetch retry")
	}
}

func TestSlotDataDefaultsMatchTheApworld(t *testing.T) {
	a := slotApp()
	if a.applySlotData(map[string]any{}) {
		t.Fatal("DeathLink must default to off")
	}
	if a.goalDifficulty != -1 {
		t.Fatal("a room without a goal must not get one guessed")
	}
	if !a.includeWaypoints || !a.includeAreas || !a.includeLevels {
		t.Fatal("check groups default to on")
	}
	if a.levelCap != ids.LevelCap(0, 0) || a.statPointsPooled || a.keyItems {
		t.Fatalf("cap %d pooled %v keys %v", a.levelCap, a.statPointsPooled, a.keyItems)
	}
}

func TestSlotDataIgnoresAnOutOfRangeGoalAct(t *testing.T) {
	for _, act := range []any{float64(-1), float64(len(ids.GoalQuestIndex)), "3"} {
		a := slotApp()
		a.applySlotData(map[string]any{"goal_difficulty": float64(0), "goal_act": act})
		if a.goalDifficulty != 0 || a.goalAct != len(ids.GoalQuestIndex)-1 {
			t.Fatalf("goal_act %v: got %d/%d, want Baal on Normal", act, a.goalDifficulty, a.goalAct)
		}
	}
}

func TestBoolFromSlotData(t *testing.T) {
	for _, tc := range []struct {
		value    any
		fallback bool
		want     bool
	}{
		{true, false, true},
		{false, true, false},
		{float64(1), false, true},
		{float64(0), true, false},
		{"yes", false, false}, // not a bool or a number: the fallback
		{nil, true, true},
	} {
		got := boolFromSlotData(map[string]any{"k": tc.value}, "k", tc.fallback)
		if got != tc.want {
			t.Errorf("%#v (fallback %v): got %v", tc.value, tc.fallback, got)
		}
	}
}
