//go:build windows

package main

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"

	"github.com/Dune172/d2r-skill-randomizer/tools/ap-client/internal/save"
)

// saves prints the location checks visible in D2R save files.
//
// It is how you confirm the save parser reads a real character correctly before trusting
// it to drive a multiworld, and the first thing to run after a D2R patch. Read-only.
//
//	d2rr-ap saves "<save folder>"
//	d2rr-ap saves "<path to a .d2s>"
func saves(args []string) int {
	if len(args) != 1 {
		fmt.Println("usage: d2rr-ap saves <save folder or .d2s file>")
		return 2
	}
	info, err := os.Stat(args[0])
	if err != nil {
		fmt.Println("ERROR:", err)
		return 1
	}
	paths := []string{args[0]}
	if info.IsDir() {
		paths, _ = filepath.Glob(filepath.Join(args[0], "*.d2s"))
	}
	if len(paths) == 0 {
		fmt.Printf("no .d2s files under %s\n", args[0])
		return 1
	}

	failed := false
	for _, p := range paths {
		st, err := save.ParseFile(p)
		if err != nil {
			fmt.Printf("%-24s ERROR  %v\n", filepath.Base(p), err)
			failed = true
			continue
		}
		fmt.Printf("\n%s  (%s)\n", filepath.Base(p), st.Name)
		// Area checks need the difficulty being played, which no field in the .d2s
		// states outright; this is the closest the file supports.
		fmt.Printf("  unlocked up to: %s\n", save.DifficultyNames[save.HighestUnlockedDifficulty(st)])
		fmt.Printf("  %d checks: %d quests, %d waypoints\n",
			len(st.CheckIDs()), len(st.CompletedQuests), len(st.ActiveWaypoints))

		quests := append([]save.Quest(nil), st.CompletedQuests...)
		sort.Slice(quests, func(i, j int) bool {
			a, b := quests[i], quests[j]
			if a.Difficulty != b.Difficulty {
				return a.Difficulty < b.Difficulty
			}
			if a.Act != b.Act {
				return a.Act < b.Act
			}
			return a.Index < b.Index
		})
		for _, q := range quests {
			fmt.Printf("    %-9s %-12s A%d  %s\n", save.DifficultyNames[q.Difficulty], q.ID(), q.Act+1, q.Name)
		}
	}
	if failed {
		return 1
	}
	return 0
}
