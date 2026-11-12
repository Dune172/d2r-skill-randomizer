//go:build windows

package main

import (
	"context"
	"fmt"
	"sort"
	"strings"

	"github.com/Dune172/d2r-skill-randomizer/tools/ap-client/internal/apc"
	"github.com/Dune172/d2r-skill-randomizer/tools/ap-client/internal/ids"
)

// handleCommand carries out a line typed in the window. It runs on the poll loop, so it
// may touch the game state the poll uses.
func (a *app) handleCommand(cmd consoleCommand) {
	switch cmd.name {
	case "help":
		printConsoleHelp()
	case "connected":
		a.loadDifficultyChoice()
	case "difficulty":
		a.chooseDifficulty(cmd.arg)
	case "chat", "joins":
		a.setMessagePref(cmd)
	case "received", "missing", "checks", "hints":
		a.roomCommand(cmd)
	}
}

// roomCommand answers the commands that read what the room knows about this slot.
func (a *app) roomCommand(cmd consoleCommand) {
	if a.conn == nil {
		logf("not connected to a room yet")
		return
	}
	var lines []string
	switch cmd.name {
	case "received":
		lines = receivedLines(a.conn.Received())
	case "missing", "checks":
		all, missing, ok := a.conn.Progress()
		if !ok {
			logf("not connected to a room yet; the room says which checks you have once it is")
			return
		}
		if cmd.name == "missing" {
			lines = missingLines(missing, a.conn.LocationName, cmd.arg)
		} else {
			lines = checksLines(all, missing)
		}
	case "hints":
		if err := a.conn.RequestHints(context.Background()); err != nil {
			logf("cannot ask for hints: %v", err)
			return
		}
		// The answer is printed when the room replies.
		return
	}
	for _, l := range lines {
		logf("%s", l)
	}
}

// latestReceived is how many of the newest items /received lists one by one.
const latestReceived = 8

// receivedLines is /received: a count of each item, then the newest few with who sent them.
func receivedLines(items []apc.ReceivedLine) []string {
	if len(items) == 0 {
		return []string{"No items received yet."}
	}
	counts := map[string]int{}
	for _, it := range items {
		counts[it.Item]++
	}
	names := make([]string, 0, len(counts))
	for name := range counts {
		names = append(names, name)
	}
	sort.Slice(names, func(i, j int) bool {
		if counts[names[i]] != counts[names[j]] {
			return counts[names[i]] > counts[names[j]]
		}
		return names[i] < names[j]
	})
	out := []string{fmt.Sprintf("You have received %d items:", len(items))}
	for _, name := range names {
		out = append(out, fmt.Sprintf("  %4d x %s", counts[name], name))
	}
	out = append(out, "Latest:")
	start := len(items) - latestReceived
	if start < 0 {
		start = 0
	}
	for _, it := range items[start:] {
		switch {
		case it.From == "" && it.Location != "":
			out = append(out, fmt.Sprintf("  %s (your %s)", it.Item, it.Location))
		case it.From == "":
			out = append(out, "  "+it.Item)
		case it.Location != "":
			out = append(out, fmt.Sprintf("  %s from %s (%s)", it.Item, it.From, it.Location))
		default:
			out = append(out, fmt.Sprintf("  %s from %s", it.Item, it.From))
		}
	}
	return out
}

// locationGroup is where /missing and /checks file a location: its heading, and a key
// that puts the headings in play order (difficulty, then act, then levels, then anything
// this app does not know).
func locationGroup(id int64) (label string, order int) {
	info, ok := ids.Locate(id)
	switch {
	case !ok:
		return "Other", 1000
	case info.Difficulty < 0:
		return info.GroupLabel(), 999
	default:
		return info.GroupLabel(), info.Difficulty*ids.Acts + info.Act
	}
}

type groupedIDs struct {
	label string
	order int
	ids   []int64
}

func groupLocations(list []int64) []*groupedIDs {
	byLabel := map[string]*groupedIDs{}
	var groups []*groupedIDs
	for _, id := range list {
		label, order := locationGroup(id)
		g := byLabel[label]
		if g == nil {
			g = &groupedIDs{label: label, order: order}
			byLabel[label] = g
			groups = append(groups, g)
		}
		g.ids = append(g.ids, id)
	}
	sort.SliceStable(groups, func(i, j int) bool { return groups[i].order < groups[j].order })
	return groups
}

// maxMissingShown keeps /missing to a screenful; a filter narrows it.
const maxMissingShown = 40

// missingLines is /missing: the checks still to find, under their act. filter, when
// given, keeps those whose heading or name contains it ("act ii", "waypoint", "hell").
func missingLines(missing []int64, name func(int64) string, filter string) []string {
	filter = strings.ToLower(strings.TrimSpace(filter))
	type entry struct {
		group string
		name  string
	}
	var shown []entry
	total := 0
	for _, g := range groupLocations(missing) {
		for _, id := range g.ids {
			n := name(id)
			if filter != "" && !strings.Contains(strings.ToLower(g.label+" "+n), filter) {
				continue
			}
			total++
			if len(shown) < maxMissingShown {
				shown = append(shown, entry{g.label, n})
			}
		}
	}
	if total == 0 {
		if filter != "" {
			return []string{fmt.Sprintf("No checks left that match %q.", filter)}
		}
		return []string{"No checks left: you have found every one."}
	}
	out := []string{fmt.Sprintf("%d checks still to find:", total)}
	last := ""
	for _, e := range shown {
		if e.group != last {
			out = append(out, e.group+":")
			last = e.group
		}
		out = append(out, "  "+e.name)
	}
	if total > len(shown) {
		out = append(out, fmt.Sprintf("...and %d more. Narrow it down, e.g. /missing normal act ii or /missing waypoint.", total-len(shown)))
	}
	return out
}

// checksLines is /checks: found out of total, act by act.
func checksLines(all, missing []int64) []string {
	left := map[int64]bool{}
	for _, id := range missing {
		left[id] = true
	}
	out := []string{fmt.Sprintf("Checks found: %d of %d", len(all)-len(missing), len(all))}
	for _, g := range groupLocations(all) {
		found := 0
		for _, id := range g.ids {
			if !left[id] {
				found++
			}
		}
		out = append(out, fmt.Sprintf("  %-18s %3d / %d", g.label, found, len(g.ids)))
	}
	return out
}
