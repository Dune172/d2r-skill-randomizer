//go:build windows

package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"sort"
	"strconv"
	"strings"

	"github.com/Dune172/d2r-skill-randomizer/tools/ap-client/internal/game"
	"github.com/hectorgimenez/d2go/pkg/data/stat"
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
// base stat values on request. It is a playtest tool (see docs/archipelago/PLAYTEST.md);
// nobody needs it to play.
//
// It exists to answer one question after every D2R patch: is a value this client writes
// honoured by the game's rules, or only displayed? Read-only unless -set is given.
//
//	d2rr-ap probe                      list the player's base stats and skills
//	d2rr-ap probe -copies              also find other copies of the player in memory
//	d2rr-ap probe -set 5=3             write 3 unspent skill points (stat id 5) to both
//	                                   copies of the character, as the client does
//	d2rr-ap probe -unit 0x1F2A -set 5=3   write to that one unit only
//	d2rr-ap probe -game                list the game's own copy instead of the display copy
//	d2rr-ap probe -insert 5=3          add an entry the character does not have (both copies)
func probe(args []string) int {
	f := flag.NewFlagSet("probe", flag.ContinueOnError)
	unitFlag := f.String("unit", "", "unit address to inspect or write (default: the player)")
	copies := f.Bool("copies", false, "scan memory for other copies of the player unit")
	gameCopy := f.Bool("game", false, "list the game's own copy of the character (the one its rules read)")
	asJSON := f.Bool("json", false, "machine-readable output")
	panels := f.Bool("panels", false, "list the game's UI tree and exit")
	dumpLists := f.Bool("dump-lists", false, "print every stat array in the unit's stat container (playtest)")
	var writes statWrites
	f.Var(&writes, "set", "overwrite a base stat: id=value (repeatable)")
	var inserts statWrites
	f.Var(&inserts, "insert", "give the character a stat it has no entry for: id=value (repeatable; both copies)")
	if err := f.Parse(args); err != nil {
		return 2
	}
	if *gameCopy && *unitFlag != "" {
		fmt.Println("ERROR: -game and -unit both choose which unit to list; give one")
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
	if *panels {
		for _, p := range gc.Panels() {
			fmt.Printf("%v 0x%x %s %q\n", p.Visible, p.Addr, p.Path, p.Text)
		}
		return 0
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

	// The game's own copy of the character, which its rules read. Without -unit, -set
	// writes it and the display copy together, as the client does.
	if *unitFlag == "" && (len(writes) > 0 || len(inserts) > 0 || *gameCopy) {
		if sim, err := gc.SimulationCopy(player); err == nil {
			report["gameCopy"] = fmt.Sprintf("0x%x", sim)
		} else {
			report["gameCopyError"] = err.Error()
		}
	}

	failed := false
	writeResults := []string{}
	for _, w := range writes {
		var existed bool
		var err error
		if *unitFlag == "" {
			existed, err = gc.SetPlayerStat(player, w.id, w.value)
		} else {
			existed, err = gc.SetBaseStat(target, w.id, w.value)
		}
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
	for _, w := range inserts {
		if *unitFlag != "" {
			fmt.Println("ERROR: -insert writes both copies; it does not take -unit")
			return 2
		}
		if err := gc.GivePlayerStat(player, w.id, w.value, 0); err != nil {
			failed = true
			writeResults = append(writeResults, fmt.Sprintf("insert stat %d: %v", w.id, err))
		} else {
			writeResults = append(writeResults, fmt.Sprintf("inserted stat %d = %d", w.id, w.value))
		}
	}
	if len(writeResults) > 0 {
		report["writes"] = writeResults
	}

	if *gameCopy && *unitFlag == "" {
		sim, err := gc.SimulationCopy(player)
		if err != nil {
			fmt.Println("ERROR: finding the game's copy:", err)
			return 1
		}
		target = sim
		report["unit"] = fmt.Sprintf("0x%x", target)
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
	if *dumpLists {
		gc.DumpStatContainer(target)
	}
	if h, err := gc.BaseStatList(target); err == nil {
		report["baseStatList"] = map[string]any{"count": h.Count, "capacity": h.Capacity, "array": fmt.Sprintf("0x%x", h.Array)}
	} else {
		report["baseStatListError"] = err.Error()
	}

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
