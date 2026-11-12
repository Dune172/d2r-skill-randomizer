//go:build windows

package main

import (
	"fmt"

	"github.com/Dune172/d2r-skill-randomizer/tools/ap-client/internal/game"
	"github.com/Dune172/d2r-skill-randomizer/tools/ap-client/internal/ids"
	"github.com/Dune172/d2r-skill-randomizer/tools/ap-client/internal/save"
)

// killChecks turns the monsters near the player into super-unique kill checks: a dead
// super-unique of a listed class, standing in one of its areas, on the current
// difficulty. A corpse counts as much as the moment of death, so walking back past one
// killed while the app was busy still checks it; one killed while the app was closed
// and since cleared from the area does not.
func (a *app) killChecks(units []game.MonsterUnit, area, difficulty int) []int64 {
	var out []int64
	for _, m := range units {
		if !m.SuperUnique() || !m.Dead() {
			continue
		}
		index, ok := ids.SuperUniqueFor(m.Txt, area)
		if !ok {
			continue
		}
		id, ok := ids.KillLocationID(difficulty, index)
		if !ok || (a.conn != nil && !a.conn.KnownLocation(id)) { // past the goal, say
			continue
		}
		if key := fmt.Sprintf("kill:%d:%d", difficulty, index); !a.seen(key) {
			out = append(out, id)
			a.logCheck("check: killed %s (%s)", ids.SuperUniques[index].Name, save.DifficultyNames[difficulty])
		}
	}
	return out
}
