package apc

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// nameTable turns the ids in a PrintJSON message into what a person would read.
//
// The server describes "Alice found Bob's Zod Rune" as three ids. Item and location ids
// are only unique within a game, and whose game applies is given per message part, so
// the table is keyed by game and the players are mapped to theirs.
type nameTable struct {
	items     map[string]map[int64]string // game -> id -> name
	locations map[string]map[int64]string
	players   map[int64]string // slot -> alias, on this client's team
	games     map[int64]string // slot -> game
	me        int64            // this client's slot
}

// ItemEvent is an item that moved to or from this slot: what a player wants to be told.
type ItemEvent struct {
	Item string
	// Other is the other player: who sent it, or who it went to. Empty when this slot
	// found one of its own items.
	Other string
	// Received is true for an item that came to this slot, false for one this slot sent.
	Received bool
	// Location is where this slot found it, when this slot was the finder; empty for an
	// item another player found.
	Location string
}

// Text is the line a player reads. Where this slot found it is said too, so an item
// that arrives a moment after the check that earned it still makes sense.
func (e ItemEvent) Text() string {
	where := ""
	if e.Location != "" {
		where = " (" + e.Location + ")"
	}
	switch {
	case e.Received && e.Other == "":
		return "You found your " + e.Item + where
	case e.Received:
		return "You received " + e.Item + " from " + e.Other
	default:
		return "You sent " + e.Item + " to " + e.Other + where
	}
}

// itemEvent reads an ItemSend PrintJSON packet, reporting only one that concerns this slot.
// ItemCheat, an item taken with !getitem where the room allows it, counts too: it
// comes from slot 0. (A host's console /send is plain text, shown only in the window.)
func (n *nameTable) itemEvent(p map[string]any) (ItemEvent, bool) {
	if p["type"] != "ItemSend" && p["type"] != "ItemCheat" {
		return ItemEvent{}, false
	}
	receiving, okR := toInt64(p["receiving"])
	item, _ := p["item"].(map[string]any)
	id, okI := toInt64(item["item"])
	finder, okF := toInt64(item["player"])
	if !okR || !okI || !okF || (receiving != n.me && finder != n.me) {
		return ItemEvent{}, false
	}
	name := n.itemName(receiving, id)
	// A location belongs to the finder's game, which is this slot's whenever it is named.
	where := ""
	if loc, ok := toInt64(item["location"]); ok && finder == n.me {
		where = n.locations[n.games[n.me]][loc]
	}
	switch {
	case receiving == n.me && finder == n.me:
		return ItemEvent{Item: name, Received: true, Location: where}, true
	case receiving == n.me:
		return ItemEvent{Item: name, Other: n.who(finder), Received: true}, true
	default:
		return ItemEvent{Item: name, Other: n.who(receiving), Location: where}, true
	}
}

// MessageKind is what a line in the game's message box is about. The app chooses how
// long each kind stays and which kinds the player has switched off.
type MessageKind int

const (
	MessageItem MessageKind = iota
	MessageHint
	MessageGoal
	MessageChat
	MessageJoin
	MessageCountdown
)

// GameMessage is one line for the game's message box.
type GameMessage struct {
	Kind MessageKind
	Text string
}

// who names a slot for a player to read.
func (n *nameTable) who(slot int64) string {
	if slot == 0 {
		return "the server"
	}
	if alias, ok := n.players[slot]; ok {
		return alias
	}
	return fmt.Sprintf("player %d", slot)
}

// itemName names an item in the game of the slot that receives it.
func (n *nameTable) itemName(owner, id int64) string {
	if name, ok := n.items[n.games[owner]][id]; ok {
		return name
	}
	return fmt.Sprintf("item %d", id)
}

// locationName names a location in the game of the slot that holds it.
func (n *nameTable) locationName(owner, id int64) string {
	if name, ok := n.locations[n.games[owner]][id]; ok {
		return name
	}
	return fmt.Sprintf("location %d", id)
}

// oneLine keeps a message to a single line: the box shows lines, and a chat message
// could carry its own breaks.
func oneLine(s string) string {
	return strings.Join(strings.Fields(s), " ")
}

// gameMessage turns a PrintJSON packet into a line for the game, when it is one a player
// here wants to see: items to and from this slot, hints that concern it, other players
// finishing, the countdown, chat, and players joining or leaving. Everything is also
// printed in the app's window; this only picks what reaches the game screen.
func (n *nameTable) gameMessage(p map[string]any) (GameMessage, bool) {
	switch p["type"] {
	case "ItemSend", "ItemCheat":
		e, ok := n.itemEvent(p)
		return GameMessage{Kind: MessageItem, Text: e.Text()}, ok

	case "Hint":
		if found, _ := p["found"].(bool); found {
			return GameMessage{}, false
		}
		receiving, okR := toInt64(p["receiving"])
		item, _ := p["item"].(map[string]any)
		id, okI := toInt64(item["item"])
		finder, okF := toInt64(item["player"])
		loc, okL := toInt64(item["location"])
		if !okR || !okI || !okF || !okL || (receiving != n.me && finder != n.me) {
			return GameMessage{}, false
		}
		return GameMessage{Kind: MessageHint, Text: n.hintText(receiving, finder, id, loc)}, true

	case "Goal":
		slot, ok := toInt64(p["slot"])
		if !ok {
			return GameMessage{}, false
		}
		if slot == n.me {
			return GameMessage{Kind: MessageGoal, Text: "Goal complete!"}, true
		}
		return GameMessage{Kind: MessageGoal, Text: n.who(slot) + " has finished!"}, true

	case "Countdown":
		text := oneLine(n.render(toSlice(p["data"])))
		return GameMessage{Kind: MessageCountdown, Text: text}, text != ""

	case "Chat":
		slot, ok := toInt64(p["slot"])
		msg, _ := p["message"].(string)
		if !ok || slot == n.me || oneLine(msg) == "" {
			return GameMessage{}, false
		}
		return GameMessage{Kind: MessageChat, Text: n.who(slot) + ": " + oneLine(msg)}, true

	case "ServerChat":
		msg, _ := p["message"].(string)
		if oneLine(msg) == "" {
			return GameMessage{}, false
		}
		return GameMessage{Kind: MessageChat, Text: "Server: " + oneLine(msg)}, true

	case "Join", "Part":
		slot, ok := toInt64(p["slot"])
		if !ok || slot == n.me {
			return GameMessage{}, false
		}
		// Trackers and text clients join too; only a player's game is worth a line.
		for _, t := range toSlice(p["tags"]) {
			if t == "Tracker" || t == "TextOnly" {
				return GameMessage{}, false
			}
		}
		verb := " joined"
		if p["type"] == "Part" {
			verb = " left"
		}
		return GameMessage{Kind: MessageJoin, Text: n.who(slot) + verb}, true
	}
	return GameMessage{}, false
}

// hintText says a hint from this slot's side. The item belongs to the receiver's game and
// the location to the finder's.
func (n *nameTable) hintText(receiving, finder, item, location int64) string {
	what, where := n.itemName(receiving, item), n.locationName(finder, location)
	switch {
	case receiving == n.me && finder == n.me:
		return "Hint: your " + what + " is at your " + where
	case receiving == n.me:
		return "Hint: your " + what + " is at " + where + " (" + n.who(finder) + ")"
	default:
		return "Hint: " + n.who(receiving) + " wants " + what + " from your " + where
	}
}

func (n *nameTable) addGame(game string, pkg map[string]any) {
	if n.items == nil {
		n.items, n.locations = map[string]map[int64]string{}, map[string]map[int64]string{}
	}
	invert := func(raw any) map[int64]string {
		out := map[int64]string{}
		table, _ := raw.(map[string]any)
		for name, v := range table {
			if id, ok := toInt64(v); ok {
				out[id] = name
			}
		}
		return out
	}
	n.items[game] = invert(pkg["item_name_to_id"])
	n.locations[game] = invert(pkg["location_name_to_id"])
}

func (n *nameTable) setPlayers(players, slotInfo any, team, me int64) {
	n.players, n.games, n.me = map[int64]string{}, map[int64]string{}, me
	for _, raw := range toSlice(players) {
		p, _ := raw.(map[string]any)
		slot, okSlot := toInt64(p["slot"])
		if t, ok := toInt64(p["team"]); !ok || !okSlot || t != team {
			continue
		}
		if alias, _ := p["alias"].(string); alias != "" {
			n.players[slot] = alias
		} else if name, _ := p["name"].(string); name != "" {
			n.players[slot] = name
		}
	}
	info, _ := slotInfo.(map[string]any)
	for key, raw := range info {
		var slot int64
		if _, err := fmt.Sscan(key, &slot); err != nil {
			continue
		}
		entry, _ := raw.(map[string]any)
		if game, _ := entry["game"].(string); game != "" {
			n.games[slot] = game
		}
	}
}

// render joins a PrintJSON message's parts, naming what it can and leaving the server's
// own text where it cannot.
func (n *nameTable) render(parts []any) string {
	var sb strings.Builder
	for _, raw := range parts {
		part, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		text := fmt.Sprint(part["text"])
		var id int64
		_, scanErr := fmt.Sscan(text, &id)
		owner, _ := toInt64(part["player"])
		switch part["type"] {
		case "player_id":
			if name, ok := n.players[id]; ok && scanErr == nil {
				text = name
			}
		case "item_id":
			if name, ok := n.items[n.games[owner]][id]; ok && scanErr == nil {
				text = name
			}
		case "location_id":
			if name, ok := n.locations[n.games[owner]][id]; ok && scanErr == nil {
				text = name
			}
		}
		sb.WriteString(text)
	}
	return sb.String()
}

func dataPackagePath(dir, game, checksum string) string {
	return filepath.Join(dir, "datapackage", sanitize(game)+"-"+sanitize(checksum)+".json")
}

// saveDataPackage caches a game's tables under its checksum, as the protocol asks, so a
// later connection does not download them again.
func saveDataPackage(dir, game string, pkg map[string]any) {
	checksum, _ := pkg["checksum"].(string)
	if dir == "" || checksum == "" {
		return
	}
	data, err := json.Marshal(pkg)
	if err != nil {
		return
	}
	path := dataPackagePath(dir, game, checksum)
	if os.MkdirAll(filepath.Dir(path), 0o755) == nil {
		_ = os.WriteFile(path, data, 0o644)
	}
}

// requestDataPackage loads the tables it has cached for the room's games and asks the
// server only for the rest.
func (c *Conn) requestDataPackage(ctx context.Context, checksums any) error {
	table, _ := checksums.(map[string]any)
	var missing []string
	c.mu.Lock()
	for game, raw := range table {
		checksum, _ := raw.(string)
		var pkg map[string]any
		if data, err := os.ReadFile(dataPackagePath(c.session.dir, game, checksum)); err == nil && c.session.dir != "" && checksum != "" {
			_ = json.Unmarshal(data, &pkg)
		}
		if pkg != nil {
			c.names.addGame(game, pkg)
		} else {
			missing = append(missing, game)
		}
	}
	c.mu.Unlock()
	if len(missing) == 0 {
		return nil
	}
	return c.send(ctx, map[string]any{"cmd": "GetDataPackage", "games": missing})
}
