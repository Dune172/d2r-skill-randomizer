package apc

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/coder/websocket"
)

// GameName must match the apworld's declared game name exactly.
const GameName = "D2R Randomizer"

// SlotContractVersion distinguishes spendable points from the retired skill-slot pool.
// Separate from the downloaded mod manifest contract, even when the numbers coincide.
const SlotContractVersion = 4

// itemsHandlingAll asks the server for every item: those from other worlds, our own
// found items, and starting inventory. The client is the source of truth for what the
// character holds, so it needs the complete stream — a partial one would make the
// derived skill vector wrong after a resync.
const itemsHandlingAll = 0b111

// clientGoal is Archipelago's ClientStatus for "this slot finished".
const clientGoal = 30

// The Archipelago version this client was written against. The apworld needs the same
// version to generate, so any server hosting a D2RR room is at least this new.
var protocolVersion = map[string]any{"major": 0, "minor": 6, "build": 7, "class": "Version"}

const deathLinkTag = "DeathLink"

// Handler receives events from the server. Called from the read loop, one at a time.
type Handler struct {
	// OnConnected fires after a successful Connected packet. slotData is the apworld's
	// fill_slot_data payload — for D2RR that carries the seed, class and savepath.
	OnConnected func(slotData map[string]any, checkedLocations []int64)
	// OnItems fires for every ReceivedItems packet, already folded into the Session.
	OnItems func(session *Session)
	// OnPrint surfaces server chat/log lines.
	OnPrint func(text string)
	// OnDeathLink fires when another player's death arrives. Only called once DeathLink
	// has been enabled, and never for a death this client sent.
	OnDeathLink func(source, cause string)
}

// Conn is a reconnecting Archipelago connection.
//
// Reconnect is not optional: Archipelago requires clients to survive an unstable link,
// and — more importantly here — checks made while disconnected must still reach the
// server. Session holds those; this type is only the transport.
type Conn struct {
	Host     string
	Port     int
	Slot     string
	Password string

	session *Session
	handler Handler

	mu            sync.Mutex
	ws            *websocket.Conn
	open          bool
	authenticated bool
	seedName      string
	synchronized  bool

	// What the room says exists, from the Connected packet. A check for a location the
	// slot does not have (past its goal, or in a group it switched off) is never sent.
	locations map[int64]bool
	names     nameTable
	deathLink bool
	// Deaths this client sent, by timestamp, so its own bounce is not acted on.
	sentDeaths map[float64]bool
}

func NewConn(host string, port int, slot, password string, session *Session, h Handler) *Conn {
	return &Conn{Host: host, Port: port, Slot: slot, Password: password, session: session, handler: h}
}

// Run maintains the connection until ctx is cancelled, reconnecting with backoff.
func (c *Conn) Run(ctx context.Context) {
	backoff := time.Second
	for ctx.Err() == nil {
		err := c.once(ctx)
		if ctx.Err() != nil {
			return
		}
		if err != nil {
			c.printf("disconnected: %v (retrying in %s)", err, backoff.Round(time.Second))
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(backoff):
		}
		if backoff < 30*time.Second {
			backoff *= 2
		}
		if backoff > 30*time.Second {
			backoff = 30 * time.Second
		}
	}
}

// once runs a single connection attempt to completion.
func (c *Conn) once(ctx context.Context) error {
	ws, err := c.dial(ctx)
	if err != nil {
		return err
	}
	defer ws.CloseNow()

	c.mu.Lock()
	c.ws, c.open = ws, true
	c.authenticated, c.synchronized = false, false
	c.mu.Unlock()
	defer func() {
		c.mu.Lock()
		c.open, c.authenticated, c.synchronized = false, false, false
		c.mu.Unlock()
	}()

	for {
		_, data, err := ws.Read(ctx)
		if err != nil {
			return err
		}
		var packets []map[string]any
		if err := json.Unmarshal(data, &packets); err != nil {
			c.printf("malformed packet: %v", err)
			continue
		}
		for _, p := range packets {
			if err := c.handle(ctx, p); err != nil {
				return err
			}
		}
	}
}

// dial tries wss:// first, then ws://.
//
// Both are required: hosted rooms are TLS, while a self-hosted server on localhost
// usually is not, and a client that only speaks one of them fails for half of users.
func (c *Conn) dial(ctx context.Context) (*websocket.Conn, error) {
	dialCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	// Archipelago warns clients that do not negotiate permessage-deflate that they "may
	// stop working in the future", and room payloads are large enough that compression
	// is worth having regardless.
	opts := &websocket.DialOptions{CompressionMode: websocket.CompressionContextTakeover}

	var lastErr error
	for _, scheme := range []string{"wss", "ws"} {
		url := fmt.Sprintf("%s://%s:%d", scheme, c.Host, c.Port)
		ws, _, err := websocket.Dial(dialCtx, url, opts)
		if err == nil {
			// Room payloads (datapackage, big item lists) exceed the small default.
			ws.SetReadLimit(32 << 20)
			c.printf("connected to %s", url)
			return ws, nil
		}
		lastErr = err
	}
	return nil, fmt.Errorf("could not connect to %s:%d: %w", c.Host, c.Port, lastErr)
}

func (c *Conn) handle(ctx context.Context, p map[string]any) error {
	switch p["cmd"] {
	case "RoomInfo":
		c.seedName, _ = p["seed_name"].(string)
		if err := c.requestDataPackage(ctx, p["datapackage_checksums"]); err != nil {
			return err
		}
		return c.send(ctx, map[string]any{
			"cmd":            "Connect",
			"game":           GameName,
			"name":           c.Slot,
			"password":       c.Password,
			"uuid":           clientUUID(c.session.dir, c.Slot),
			"version":        protocolVersion,
			"items_handling": itemsHandlingAll,
			"tags":           []string{},
			"slot_data":      true,
		})

	case "Connected":
		slotData, _ := p["slot_data"].(map[string]any)
		if version, ok := slotData["contract_version"].(float64); !ok || version != SlotContractVersion {
			return fmt.Errorf("incompatible D2RR room contract %v (client requires %d); install the matching d2rr.apworld and generate a new room for Progressive Skill Point items", slotData["contract_version"], SlotContractVersion)
		}
		if ratio, ok := toInt64(slotData["fragments_per_point"]); !ok || ratio != 5 {
			return fmt.Errorf("unsupported training-fragment conversion in room data")
		}
		team, teamOK := toInt64(p["team"])
		slot, slotOK := toInt64(p["slot"])
		if !teamOK || !slotOK {
			return fmt.Errorf("room omitted team or slot")
		}
		if err := c.session.Bind(c.seedName, team, slot); err != nil {
			return err
		}
		c.mu.Lock()
		c.authenticated = true
		c.mu.Unlock()
		var server []int64
		known := map[int64]bool{}
		for _, v := range toSlice(p["checked_locations"]) {
			if n, ok := toInt64(v); ok {
				server = append(server, n)
				known[n] = true
			}
		}
		for _, v := range toSlice(p["missing_locations"]) {
			if n, ok := toInt64(v); ok {
				known[n] = true
			}
		}
		c.mu.Lock()
		c.locations = known
		c.names.setPlayers(p["players"], p["slot_info"], team)
		c.mu.Unlock()
		// Fold the server's view in, then send OURS in full. Locations checked while
		// disconnected exist only locally, and a delta would strand them permanently.
		if _, err := c.session.AddChecks(server); err != nil {
			return err
		}
		if c.handler.OnConnected != nil {
			c.handler.OnConnected(slotData, server)
		}
		// Tags can only be known once slot_data has arrived, so they follow Connect.
		c.mu.Lock()
		deathLink := c.deathLink
		c.mu.Unlock()
		if deathLink {
			if err := c.send(ctx, map[string]any{"cmd": "ConnectUpdate", "items_handling": itemsHandlingAll, "tags": []string{deathLinkTag}}); err != nil {
				return err
			}
		}
		if err := c.SendChecks(ctx, c.session.AllChecks()); err != nil {
			return err
		}
		// A successful socket write is not an acknowledgement. Replay completion
		// on every authenticated connection just as we replay checked locations.
		if c.session.HasGoal() {
			return c.send(ctx, map[string]any{"cmd": "StatusUpdate", "status": clientGoal})
		}
		return nil

	case "ReceivedItems":
		if !c.Connected() {
			return fmt.Errorf("ReceivedItems before room authentication")
		}
		rawItems, validItems := p["items"].([]any)
		if !validItems {
			return fmt.Errorf("ReceivedItems omitted its item list")
		}
		index, okIndex := toInt64(p["index"])
		if !okIndex || index < 0 {
			return fmt.Errorf("invalid received-item index")
		}
		if index == 0 {
			c.mu.Lock()
			c.synchronized = false
			c.mu.Unlock()
		}
		var items []NetworkItem
		for _, raw := range rawItems {
			m, ok := raw.(map[string]any)
			if !ok {
				return fmt.Errorf("invalid received item")
			}
			it := NetworkItem{}
			if v, ok := toInt64(m["item"]); ok {
				it.Item = v
			} else {
				return fmt.Errorf("invalid received item id")
			}
			// Absent/-1 player and location are legitimate (server grants, item links).
			if v, ok := toInt64(m["location"]); ok {
				it.Location = v
			}
			if v, ok := toInt64(m["player"]); ok {
				it.Player = v
			}
			items = append(items, it)
		}
		applied, err := c.session.ApplyReceivedItems(int(index), items)
		if errors.Is(err, ErrItemGap) {
			// A packet was missed. Ask for the whole list again, and resend our checks
			// as the protocol requires; writes stay paused until the replay arrives.
			c.mu.Lock()
			c.synchronized = false
			c.mu.Unlock()
			c.printf("item stream out of step (%v); asking the server to resend", err)
			if err := c.send(ctx, map[string]any{"cmd": "Sync"}); err != nil {
				return err
			}
			return c.SendChecks(ctx, c.session.AllChecks())
		}
		if err != nil {
			return fmt.Errorf("applying received items: %w", err)
		}
		if applied && c.handler.OnItems != nil {
			c.handler.OnItems(c.session)
		}
		// The app has consumed the new counts before writes are enabled again.
		if index == 0 {
			c.mu.Lock()
			c.synchronized = true
			c.mu.Unlock()
		}
		return nil

	case "ConnectionRefused":
		errs := toSlice(p["errors"])
		parts := make([]string, 0, len(errs))
		for _, e := range errs {
			parts = append(parts, fmt.Sprint(e))
		}
		// Not retryable: a bad slot name or password will fail identically forever.
		return fmt.Errorf("connection refused by server: %s", strings.Join(parts, ", "))

	case "DataPackage":
		data, _ := p["data"].(map[string]any)
		games, _ := data["games"].(map[string]any)
		c.mu.Lock()
		for game, raw := range games {
			if pkg, ok := raw.(map[string]any); ok {
				c.names.addGame(game, pkg)
				saveDataPackage(c.session.dir, game, pkg)
			}
		}
		c.mu.Unlock()

	case "Bounced":
		if !hasTag(p["tags"], deathLinkTag) {
			return nil
		}
		data, _ := p["data"].(map[string]any)
		stamp, _ := data["time"].(float64)
		c.mu.Lock()
		mine := c.sentDeaths[stamp]
		enabled := c.deathLink
		c.mu.Unlock()
		if mine || !enabled || c.handler.OnDeathLink == nil {
			return nil
		}
		source, _ := data["source"].(string)
		cause, _ := data["cause"].(string)
		c.handler.OnDeathLink(source, cause)

	case "PrintJSON":
		if c.handler.OnPrint != nil {
			c.mu.Lock()
			text := c.names.render(toSlice(p["data"]))
			c.mu.Unlock()
			if text != "" {
				c.handler.OnPrint(text)
			}
		}
	}
	return nil
}

// EnableDeathLink makes the next (and current) connection carry the DeathLink tag.
func (c *Conn) EnableDeathLink() {
	c.mu.Lock()
	c.deathLink = true
	c.mu.Unlock()
}

// SendDeath tells every other DeathLink player that this character died.
func (c *Conn) SendDeath(ctx context.Context, cause string) error {
	stamp := float64(time.Now().UnixNano()) / 1e9
	c.mu.Lock()
	if !c.deathLink {
		c.mu.Unlock()
		return nil
	}
	if c.sentDeaths == nil {
		c.sentDeaths = map[float64]bool{}
	}
	c.sentDeaths[stamp] = true
	c.mu.Unlock()
	return c.send(ctx, map[string]any{
		"cmd":  "Bounce",
		"tags": []string{deathLinkTag},
		"data": map[string]any{"time": stamp, "source": c.Slot, "cause": cause},
	})
}

// Say sends a line of chat. Commands starting with "!" are handled by the server.
func (c *Conn) Say(ctx context.Context, text string) error {
	return c.send(ctx, map[string]any{"cmd": "Say", "text": text})
}

// KnownLocation reports whether the room has this location for this slot. Before the
// room has said what exists, everything is assumed to.
func (c *Conn) KnownLocation(id int64) bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.locations == nil || c.locations[id]
}

func hasTag(tags any, want string) bool {
	for _, t := range toSlice(tags) {
		if t == want {
			return true
		}
	}
	return false
}

// SendChecks reports checked locations. Safe to call with the full set: the server
// deduplicates, and resending is explicitly permitted.
func (c *Conn) SendChecks(ctx context.Context, ids []int64) error {
	if len(ids) == 0 {
		return nil
	}
	return c.send(ctx, map[string]any{"cmd": "LocationChecks", "locations": ids})
}

// SendGoal reports completion, once.
func (c *Conn) SendGoal(ctx context.Context) error {
	if c.session.HasGoal() {
		return nil
	}
	if err := c.send(ctx, map[string]any{"cmd": "StatusUpdate", "status": clientGoal}); err != nil {
		return err
	}
	return c.session.MarkGoal()
}

// Connected reports whether the socket is up and the slot authenticated. Callers use this to decide
// whether to send now or leave the check queued for the next connect.
func (c *Conn) Connected() bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.open && c.authenticated
}

// Synchronized gates memory writes until the server has sent a full item replay.
func (c *Conn) Synchronized() bool { c.mu.Lock(); defer c.mu.Unlock(); return c.synchronized }

func (c *Conn) send(ctx context.Context, packet map[string]any) error {
	c.mu.Lock()
	ws, open := c.ws, c.open
	c.mu.Unlock()
	if !open || ws == nil {
		return fmt.Errorf("not connected")
	}
	data, err := json.Marshal([]map[string]any{packet})
	if err != nil {
		return err
	}
	writeCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	return ws.Write(writeCtx, websocket.MessageText, data)
}

func (c *Conn) printf(format string, args ...any) {
	if c.handler.OnPrint != nil {
		c.handler.OnPrint(fmt.Sprintf(format, args...))
	}
}

// JSON numbers decode as float64; ids can exceed what that represents exactly only
// beyond 2^53, which Archipelago ids never approach.
func toInt64(v any) (int64, bool) {
	switch n := v.(type) {
	case float64:
		if n != float64(int64(n)) {
			return 0, false
		}
		return int64(n), true
	case int64:
		return n, true
	case int:
		return int64(n), true
	case json.Number:
		i, err := n.Int64()
		return i, err == nil
	}
	return 0, false
}

func toSlice(v any) []any {
	s, _ := v.([]any)
	return s
}
