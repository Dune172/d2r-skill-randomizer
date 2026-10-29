package main

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
