package main

import "github.com/swannysoft/d2rr-ap-client/internal/ids"

// applySlotData adopts the room's settings from the Connected packet's slot_data, and
// reports whether the room wants DeathLink.
func (a *app) applySlotData(slotData map[string]any) (deathLink bool) {
	// The goal comes from the apworld, not from a flag: the client must not be
	// able to declare victory on a difficulty the room did not ask for. It also
	// decides how area checks resolve their difficulty, so it is read first.
	if v, ok := slotData["goal_difficulty"].(float64); ok {
		act := len(ids.GoalQuestIndex) - 1
		if g, ok := slotData["goal_act"].(float64); ok && g >= 0 && int(g) < len(ids.GoalQuestIndex) {
			act = int(g)
		}
		a.setGoal(int(v), act)
		logf("goal: kill %s on %s", goalBossNames[act], difficultyName(int(v)))
	}
	// Optional check groups. Defaulting to ON matches the apworld defaults; a
	// room that disabled them says so explicitly.
	a.mu.Lock()
	defer a.mu.Unlock()
	a.includeWaypoints = boolFromSlotData(slotData, "include_waypoints", true)
	a.includeAreas = boolFromSlotData(slotData, "include_areas", true)
	a.includeLevels = boolFromSlotData(slotData, "include_level_milestones", true)
	a.levelCap = ids.LevelCap(0, 0)
	if v, ok := slotData["level_cap"].(float64); ok {
		a.levelCap = int(v)
	}
	a.statPointsPooled = boolFromSlotData(slotData, "stat_points_pooled", false)
	if v, ok := slotData["horadric_keys"].(float64); ok {
		a.keyItems = v > 0
	}
	a.deathLink = boolFromSlotData(slotData, "death_link", false)
	a.slotData = slotData
	return a.deathLink
}

func boolFromSlotData(slotData map[string]any, key string, fallback bool) bool {
	switch v := slotData[key].(type) {
	case bool:
		return v
	case float64: // JSON numbers, which is how a Python bool can arrive
		return v != 0
	default:
		return fallback
	}
}

var goalBossNames = []string{"Andariel", "Duriel", "Mephisto", "Diablo", "Baal"}

func (a *app) setGoal(difficulty, act int) {
	a.mu.Lock()
	a.goalDifficulty, a.goalAct = difficulty, act
	a.mu.Unlock()
}
