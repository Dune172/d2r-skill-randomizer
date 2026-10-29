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

func (n *nameTable) setPlayers(players, slotInfo any, team int64) {
	n.players, n.games = map[int64]string{}, map[int64]string{}
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
