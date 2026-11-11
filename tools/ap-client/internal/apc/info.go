package apc

import (
	"context"
	"fmt"
	"sort"
)

// What the app's /received, /missing, /checks and /hints commands read. All of it comes
// from the room, so it is only known while (or after) the slot is connected.

// logReceived keeps the received-item list in step with the server's numbering. A
// packet that starts at 0 is a full replay; one that overlaps what is held adds only
// its new tail; one past the end is a gap, which the Sync already asked for fills.
func (c *Conn) logReceived(index int, items []NetworkItem) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if index == 0 {
		c.received = nil
	}
	if index > len(c.received) {
		return
	}
	if fresh := index + len(items) - len(c.received); fresh > 0 {
		c.received = append(c.received, items[len(items)-fresh:]...)
	}
}

// ReceivedLine is one item the room sent this slot, named.
type ReceivedLine struct {
	Item string
	// From is who found it; empty for an item this slot found itself.
	From string
	// Location is where it was found, in the finder's game; empty for a server grant.
	Location string
}

// Received is every item this slot has received, oldest first.
func (c *Conn) Received() []ReceivedLine {
	c.mu.Lock()
	defer c.mu.Unlock()
	out := make([]ReceivedLine, 0, len(c.received))
	for _, it := range c.received {
		line := ReceivedLine{Item: c.names.itemName(c.slot, it.Item)}
		if it.Player != c.slot {
			line.From = c.names.who(it.Player)
		}
		if it.Player != 0 && it.Location >= 0 {
			line.Location = c.names.locationName(it.Player, it.Location)
		}
		out = append(out, line)
	}
	return out
}

// Progress is this slot's locations: every one the room has for it and those still
// unchecked, both sorted. ok is false until the room has said (no Connected yet).
func (c *Conn) Progress() (all, missing []int64, ok bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.locations == nil {
		return nil, nil, false
	}
	for id := range c.locations {
		all = append(all, id)
	}
	for id := range c.missing {
		missing = append(missing, id)
	}
	sort.Slice(all, func(i, j int) bool { return all[i] < all[j] })
	sort.Slice(missing, func(i, j int) bool { return missing[i] < missing[j] })
	return all, missing, true
}

// ProgressCounts is how many locations the room has for this slot and how many are still
// unchecked; ok is false until the room has said.
func (c *Conn) ProgressCounts() (all, missing int, ok bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	return len(c.locations), len(c.missing), c.locations != nil
}

// LocationName names one of this slot's locations, from the room's tables.
func (c *Conn) LocationName(id int64) string {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.names.locationName(c.slot, id)
}

func (c *Conn) hintsKey() string {
	c.mu.Lock()
	defer c.mu.Unlock()
	return fmt.Sprintf("_read_hints_%d_%d", c.team, c.slot)
}

// RequestHints asks the server for this slot's hints. The answer arrives as a Retrieved
// packet and is printed then.
func (c *Conn) RequestHints(ctx context.Context) error {
	if !c.Connected() {
		return fmt.Errorf("not connected")
	}
	return c.send(ctx, map[string]any{"cmd": "Get", "keys": []string{c.hintsKey()}})
}

// HintLine is a hint as /hints prints it.
type HintLine struct {
	Text  string
	Found bool
}

// hintLines reads the server's stored hints for this slot.
func (c *Conn) hintLines(raw any) []HintLine {
	c.mu.Lock()
	defer c.mu.Unlock()
	var out []HintLine
	for _, h := range toSlice(raw) {
		m, _ := h.(map[string]any)
		receiving, okR := toInt64(m["receiving_player"])
		finder, okF := toInt64(m["finding_player"])
		item, okI := toInt64(m["item"])
		loc, okL := toInt64(m["location"])
		if !okR || !okF || !okI || !okL {
			continue
		}
		found, _ := m["found"].(bool)
		out = append(out, HintLine{Text: c.names.hintText(receiving, finder, item, loc), Found: found})
	}
	return out
}

// printHints answers /hints from a Retrieved packet.
func (c *Conn) printHints(keys any) {
	table, _ := keys.(map[string]any)
	raw, ok := table[c.hintsKey()]
	if !ok {
		return
	}
	lines := c.hintLines(raw)
	open, found := 0, 0
	for _, l := range lines {
		if l.Found {
			found++
		} else {
			open++
		}
	}
	if open == 0 {
		c.printf("No open hints for you (%d already found). Type !hint <item> to ask for one.", found)
		return
	}
	c.printf("Open hints (%d; %d more already found):", open, found)
	for _, l := range lines {
		if !l.Found {
			c.printf("  %s", l.Text)
		}
	}
}
