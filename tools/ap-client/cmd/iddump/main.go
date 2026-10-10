// Command iddump prints the client's id tables as JSON.
//
// Exists solely so scripts/verify-ap-ids.mjs can diff them against the apworld's Python
// tables. The apworld generates offline and never talks to the client, so the ONLY thing
// keeping them in agreement is that both derive ids from the same fixed ordering — and
// the only thing proving it is this diff.
package main

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/swannysoft/d2rr-ap-client/internal/ids"
)

func main() {
	locations := map[string]int64{}
	for d := 0; d < ids.Difficulties; d++ {
		for act, n := range ids.QuestsPerAct {
			for i := 0; i < n; i++ {
				id, ok := ids.QuestLocationID(d, act, i)
				if !ok {
					os.Exit(1)
				}
				locations[fmt.Sprintf("q:%d:%d:%d", d, act, i)] = id
			}
		}
		for i := 0; i < ids.Waypoints; i++ {
			id, ok := ids.WaypointLocationID(d, i)
			if !ok {
				os.Exit(1)
			}
			locations[fmt.Sprintf("wp:%d:%d", d, i)] = id
		}
		for i := 0; i < ids.Areas(); i++ {
			id, ok := ids.AreaLocationID(d, i)
			if !ok {
				os.Exit(1)
			}
			locations[fmt.Sprintf("area:%d:%d", d, i)] = id
		}
	}
	for clvl := ids.LevelMin; clvl <= ids.LevelMax; clvl++ {
		id, ok := ids.LevelLocationID(clvl)
		if !ok {
			os.Exit(1)
		}
		locations[fmt.Sprintf("lvl:%d", clvl)] = id
	}

	runes := make([]string, len(ids.RuneNames))
	for i := range ids.RuneNames {
		runes[i] = ids.RuneItemName(i)
	}

	out, _ := json.MarshalIndent(map[string]any{
		"itemBase":             ids.ItemBase,
		"locationBase":         ids.LocationBase,
		"classes":              ids.Classes,
		"questsPerAct":         ids.QuestsPerAct,
		"questsTotal":          ids.QuestsTotal(),
		"locationsTotal":       ids.LocationsTotal(),
		"areas":                ids.Areas(),
		"levelMin":             ids.LevelMin,
		"levelMax":             ids.LevelMax,
		"levelCaps":            ids.LevelCaps,
		"goalQuestIndex":       ids.GoalQuestIndex,
		"fragmentsPerPoint":    ids.FragmentsPerPoint,
		"statPointsPerItem":    ids.StatPointsPerItem,
		"keysForHoradricStaff": ids.KeysForHoradricStaff,
		"keysForKhalimsWill":   ids.KeysForKhalimsWill,
		// Dumped in full, not just counted: a transcription difference between the two
		// generated area tables would otherwise only show up as a player entering an
		// area and checking the wrong location.
		"areaLevelIds": ids.AreaLevelIDs,
		"areaLabels":   ids.AreaLabels,
		"areaActs":     ids.AreaActs,
		"items":        ids.ItemNames(),
		"traps":        ids.Traps,
		"runes":        runes,
		"locations":    locations,
	}, "", "  ")
	fmt.Println(string(out))
}
