package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"sort"
	"strconv"
	"strings"

	"github.com/hectorgimenez/d2go/pkg/data/stat"
	"github.com/swannysoft/d2rr-ap-client/internal/game"
)

// statWrites collects repeated -set id=value flags.
type statWrites []statWrite

type statWrite struct {
	id    stat.ID
	value uint32
}

func (w *statWrites) String() string { return fmt.Sprint(*w) }

func (w *statWrites) Set(s string) error {
	name, raw, ok := strings.Cut(s, "=")
	if !ok {
		return fmt.Errorf("want id=value, got %q", s)
	}
	id, err := strconv.ParseUint(name, 10, 16)
	if err != nil {
		return fmt.Errorf("stat id %q: %w", name, err)
	}
	value, err := strconv.ParseUint(raw, 10, 32)
	if err != nil {
		return fmt.Errorf("stat value %q: %w", raw, err)
	}
	*w = append(*w, statWrite{stat.ID(id), uint32(value)})
	return nil
}

// probe inspects the loaded character without a room or a manifest, and can overwrite
// base stat values on request.
//
// It exists to answer one question after every D2R patch: is a value this client writes
// honoured by the game's rules, or only displayed? Read-only unless -set is given.
//
//	d2rr-ap probe                      list the player's base stats and skills
//	d2rr-ap probe -copies              also find other copies of the player in memory
//	d2rr-ap probe -set 5=3             write 3 unspent skill points (stat id 5)
//	d2rr-ap probe -unit 0x1F2A -set 5=3   write to a copy found by -copies instead
func probe(args []string) int {
	f := flag.NewFlagSet("probe", flag.ContinueOnError)
	unitFlag := f.String("unit", "", "unit address to inspect or write (default: the player)")
	copies := f.Bool("copies", false, "scan memory for other copies of the player unit")
	asJSON := f.Bool("json", false, "machine-readable output")
	var writes statWrites
	f.Var(&writes, "set", "overwrite a base stat: id=value (repeatable)")
	if err := f.Parse(args); err != nil {
		return 2
	}

	gc, err := game.Attach()
	if err != nil {
		fmt.Println("ERROR:", err)
		return 1
	}
	defer gc.Close()
	if gc.IsOnline() {
		fmt.Println("ERROR: D2R is online. This tool only works on offline characters.")
		return 1
	}
	player := gc.PlayerUnit()
	if player == 0 {
		fmt.Println("ERROR: no character is in a game")
		return 1
	}
	target := player
	if *unitFlag != "" {
		addr, err := strconv.ParseUint(strings.TrimPrefix(strings.ToLower(*unitFlag), "0x"), 16, 64)
		if err != nil {
			fmt.Println("ERROR: -unit:", err)
			return 2
		}
		target = uintptr(addr)
	}

	report := map[string]any{"player": fmt.Sprintf("0x%x", player), "unit": fmt.Sprintf("0x%x", target)}
	if name, err := gc.CharacterName(player); err == nil {
		report["character"] = name
	}
	if cls, err := gc.ReadClass(player); err == nil {
		report["classID"] = cls
	}

	failed := false
	writeResults := []string{}
	for _, w := range writes {
		existed, err := gc.SetBaseStat(target, w.id, w.value)
		switch {
		case err != nil:
			failed = true
			writeResults = append(writeResults, fmt.Sprintf("stat %d: %v", w.id, err))
		case !existed:
			failed = true
			writeResults = append(writeResults, fmt.Sprintf("stat %d: no entry to write", w.id))
		default:
			writeResults = append(writeResults, fmt.Sprintf("stat %d = %d", w.id, w.value))
		}
	}
	if len(writeResults) > 0 {
		report["writes"] = writeResults
	}

	type statRow struct {
		Layer uint16 `json:"layer"`
		ID    int    `json:"id"`
		Value uint32 `json:"value"`
	}
	entries, err := gc.BaseStats(target)
	if err != nil {
		fmt.Println("ERROR: reading base stats:", err)
		return 1
	}
	stats := make([]statRow, 0, len(entries))
	for _, e := range entries {
		stats = append(stats, statRow{e.Layer, int(e.ID), e.Value})
	}
	report["baseStats"] = stats

	if nodes, err := gc.Skills(target); err == nil {
		skills := map[string]int{}
		for _, n := range nodes {
			if n.Level > 0 {
				skills[strconv.Itoa(int(n.ID))] = int(n.Level)
			}
		}
		report["skillLevels"] = skills
		report["skillNodes"] = len(nodes)
	} else {
		report["skillError"] = err.Error()
	}

	if *copies {
		found, err := gc.FindUnitCopies(player)
		if err != nil {
			fmt.Println("ERROR: scanning for copies:", err)
			return 1
		}
		list := []map[string]any{}
		for _, c := range found {
			row := map[string]any{"unit": fmt.Sprintf("0x%x", c.Addr), "level": c.Level, "stats": c.Stats}
			if c.HasSkillPoints {
				row["unspentSkillPoints"] = c.SkillPoints
			}
			list = append(list, row)
		}
		report["copies"] = list
	}

	if *asJSON {
		raw, _ := json.MarshalIndent(report, "", "  ")
		fmt.Println(string(raw))
	} else {
		keys := make([]string, 0, len(report))
		for k := range report {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		for _, k := range keys {
			raw, _ := json.Marshal(report[k])
			fmt.Printf("%s: %s\n", k, raw)
		}
	}
	if failed {
		return 1
	}
	return 0
}
