// Package apc implements the Archipelago client protocol and the local state a slot
// must keep to satisfy it.
//
// This file is the pure, transport-free half: the durable session state and the rules
// Archipelago requires of every client. It is deliberately separable from the socket so
// the hard requirements can be tested exhaustively without a server.
//
// The requirements this exists to satisfy (Archipelago docs/adding games.md):
//   - locations checked while DISCONNECTED must be sent on reconnect, or they are lost
//     forever when the triggering action is one-shot
//   - an item may arrive any number of times, beyond what the game normally expects
//   - items may arrive with no attributed player or location
//   - a received-item index must be kept so the server can resync
package apc

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"sync"
)

// NetworkItem mirrors Archipelago's item payload.
//
// Player and Location are signed and may be -1: server-granted items (a !getitem, an
// item link, starting inventory) carry no attribution. Treating those as invalid would
// silently drop legitimate grants.
type NetworkItem struct {
	Item     int64 `json:"item"`
	Location int64 `json:"location"`
	Player   int64 `json:"player"`
	Flags    int64 `json:"flags"`
}

// Session is the durable state for one slot in one multiworld.
//
// Persisted BEFORE anything is sent. A crash between persist and send costs a duplicate
// send, which the server dedupes; the reverse order would lose a check permanently.
type Session struct {
	Room      string `json:"room"`
	Character string `json:"character,omitempty"`
	identity  string
	dir       string
	Slot      string `json:"slot"`

	// Every location id this client has ever observed as checked. Sent in FULL on
	// every connect — the delta is not enough, because checks made while offline must
	// still reach the server.
	CheckedLocations []int64 `json:"checkedLocations"`

	// Count per item id, the source of truth for how many of each item we hold.
	// Counting rather than storing a list is what makes duplicates, out-of-order
	// delivery and full resyncs all trivially idempotent.
	ItemCounts map[string]int `json:"itemCounts"`

	// How many copies of a one-shot item (gold, a trap, a rune) have already been
	// carried out. ItemCounts minus this is what is still owed, which survives restarts
	// and full resyncs because the counts are rebuilt identically.
	Applied map[string]int `json:"applied,omitempty"`

	// Set by -mail-flip to correct the client's belief about which Sigil the player
	// holds, should the two ever disagree.
	MailFlipped bool `json:"mailFlipped,omitempty"`

	// Highest ReceivedItems index applied. The server resends from 0 to resync.
	LastReceivedIndex int `json:"lastReceivedIndex"`

	GoalReported bool `json:"goalReported"`

	path string
	mu   sync.Mutex
}

// NewSession loads persisted state for a room/slot, or starts fresh.
func NewSession(dir, room, slot string) (*Session, error) {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, fmt.Errorf("creating state dir: %w", err)
	}
	path := filepath.Join(dir, fmt.Sprintf("%x.json", sha256.Sum256([]byte(room+"\x00"+slot))))

	s := &Session{Room: room, Slot: slot, ItemCounts: map[string]int{}, Applied: map[string]int{}, path: path}
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return s, nil
		}
		return nil, err
	}
	if err := json.Unmarshal(data, s); err != nil {
		return nil, fmt.Errorf("state file %s is damaged; restore its backup before resuming: %w", path, err)
	}
	if s.ItemCounts == nil {
		s.ItemCounts = map[string]int{}
	}
	if s.Applied == nil {
		s.Applied = map[string]int{}
	}
	if s.Room != room || s.Slot != slot {
		return nil, fmt.Errorf("state identity mismatch in %s", path)
	}
	s.path = path
	return s, nil
}

// Save persists atomically (temp + rename) so a crash mid-write cannot truncate state.
func (s *Session) Save() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.saveLocked()
}

func (s *Session) saveLocked() error {
	if s.path == "" {
		return nil // in-memory session (tests)
	}
	data, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return err
	}
	tmp := s.path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return err
	}
	if previous, err := os.ReadFile(s.path); err == nil {
		if err = os.WriteFile(s.path+".bak", previous, 0600); err != nil {
			return err
		}
	} else if !os.IsNotExist(err) {
		return err
	}
	return os.Rename(tmp, s.path)
}

// AddChecks records newly observed locations and returns the ones that were not already
// known. Persists before returning, so the caller can send afterwards.
func (s *Session) AddChecks(ids []int64) ([]int64, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	before := append([]int64(nil), s.CheckedLocations...)
	known := make(map[int64]bool, len(s.CheckedLocations))
	for _, id := range s.CheckedLocations {
		known[id] = true
	}
	var added []int64
	for _, id := range ids {
		if !known[id] {
			known[id] = true
			added = append(added, id)
			s.CheckedLocations = append(s.CheckedLocations, id)
		}
	}
	if len(added) == 0 {
		return nil, nil
	}
	sort.Slice(s.CheckedLocations, func(i, j int) bool { return s.CheckedLocations[i] < s.CheckedLocations[j] })
	if err := s.saveLocked(); err != nil {
		s.CheckedLocations = before
		return nil, err
	}
	return added, nil
}

// AllChecks returns every known checked location. This — not a delta — is what gets
// sent on connect, so offline checks are never stranded.
func (s *Session) AllChecks() []int64 {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]int64, len(s.CheckedLocations))
	copy(out, s.CheckedLocations)
	return out
}

// ErrItemGap means a ReceivedItems packet did not continue from what the session holds:
// a packet was missed, and the server must be asked to resend the whole list.
var ErrItemGap = errors.New("item index gap")

// ApplyReceivedItems folds a ReceivedItems packet into the session.
//
// index == 0 means the server is resending from the beginning: discard local counts and
// rebuild. Because counts are a pure function of the item stream, a resync needs no
// reconciliation logic.
//
// Any other index is appended only if it continues from what we have; a gap means we
// missed a packet, and the caller should request a resync rather than apply it.
func (s *Session) ApplyReceivedItems(index int, items []NetworkItem) (applied bool, err error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if index < 0 {
		return false, fmt.Errorf("negative received-item index")
	}
	if index > s.LastReceivedIndex {
		return false, fmt.Errorf("%w: got %d, have %d", ErrItemGap, index, s.LastReceivedIndex)
	}
	previous, previousIndex := s.ItemCounts, s.LastReceivedIndex
	next := map[string]int{}
	if index != 0 {
		for k, v := range previous {
			next[k] = v
		}
		overlap := s.LastReceivedIndex - index
		if overlap >= len(items) {
			return false, nil
		}
		items = items[overlap:]
	} else {
		s.LastReceivedIndex = 0
	}
	for _, it := range items {
		next[itemKey(it.Item)]++
	}
	s.ItemCounts = next
	s.LastReceivedIndex += len(items)
	if err := s.saveLocked(); err != nil {
		s.ItemCounts, s.LastReceivedIndex = previous, previousIndex
		return false, err
	}
	return true, nil
}

// Count returns how many of an item the slot holds. Counts are NOT clamped here:
// Archipelago explicitly allows receiving more copies than a game expects, and the
// clamp belongs where the value is applied (a skill level caps at 20), not where it is
// recorded — clamping here would corrupt state on resync.
func (s *Session) Count(item int64) int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.ItemCounts[itemKey(item)]
}

// MarkGoal records that the goal was reported, so it is sent once.
func (s *Session) MarkGoal() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.GoalReported {
		return nil
	}
	s.GoalReported = true
	if err := s.saveLocked(); err != nil {
		s.GoalReported = false
		return err
	}
	return nil
}

func itemKey(id int64) string { return fmt.Sprintf("%d", id) }

func sanitize(s string) string {
	out := make([]rune, 0, len(s))
	for _, r := range s {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9', r == '-', r == '_':
			out = append(out, r)
		default:
			out = append(out, '_')
		}
	}
	if len(out) == 0 {
		return "default"
	}
	if len(out) > 48 {
		out = out[:48]
	}
	return string(out)
}

// PendingSession never opens the legacy host:port cache. The server must identify
// the generation, team and numeric slot before any progress can be loaded.
func PendingSession(dir, slot string) *Session {
	return &Session{Slot: slot, ItemCounts: map[string]int{}, Applied: map[string]int{}, dir: dir}
}

func (s *Session) Bind(seed string, team, slot int64) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if seed == "" || team < 0 || slot < 1 {
		return fmt.Errorf("room omitted its generation/team/slot identity")
	}
	identity := fmt.Sprintf("%s/%d/%d", seed, team, slot)
	if s.identity != "" {
		if s.identity != identity {
			return fmt.Errorf("server changed multiworld identity; restart the client to select the new room")
		}
		return nil
	}
	loaded, err := NewSession(s.dir, identity, fmt.Sprintf("slot-%d", slot))
	if err != nil {
		return err
	}
	s.Room, s.path, s.identity = identity, loaded.path, identity
	s.Slot = loaded.Slot
	s.Character = loaded.Character
	s.CheckedLocations, s.ItemCounts, s.Applied = loaded.CheckedLocations, loaded.ItemCounts, loaded.Applied
	s.LastReceivedIndex, s.GoalReported = loaded.LastReceivedIndex, loaded.GoalReported
	s.MailFlipped = loaded.MailFlipped
	return nil
}

func (s *Session) BindCharacter(name string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if name == "" {
		return fmt.Errorf("character name is empty")
	}
	if s.Character != "" && s.Character != name {
		return fmt.Errorf("slot is bound to character %q, not %q", s.Character, name)
	}
	if s.Character == name {
		return nil
	}
	s.Character = name
	if err := s.saveLocked(); err != nil {
		s.Character = ""
		return err
	}
	return nil
}

func (s *Session) CharacterName() string { s.mu.Lock(); defer s.mu.Unlock(); return s.Character }
func (s *Session) HasGoal() bool         { s.mu.Lock(); defer s.mu.Unlock(); return s.GoalReported }
func (s *Session) Identity() string      { s.mu.Lock(); defer s.mu.Unlock(); return s.Room }

// Counts reads related reward currencies from one consistent snapshot.
func (s *Session) Counts(items ...int64) []int {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]int, len(items))
	for i, id := range items {
		out[i] = s.ItemCounts[itemKey(id)]
	}
	return out
}

// StatePath is empty until an authenticated room has bound the session.
func (s *Session) StatePath() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.path
}

// Pending is how many copies of a one-shot item are still owed to the character.
func (s *Session) Pending(item int64) int {
	s.mu.Lock()
	defer s.mu.Unlock()
	if n := s.ItemCounts[itemKey(item)] - s.Applied[itemKey(item)]; n > 0 {
		return n
	}
	return 0
}

// MarkApplied records that n more copies of a one-shot item have been carried out.
// Call it AFTER the effect has landed: a crash in between repeats the effect once, which
// is the harmless direction.
func (s *Session) MarkApplied(item int64, n int) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	key := itemKey(item)
	s.Applied[key] += n
	if err := s.saveLocked(); err != nil {
		s.Applied[key] -= n
		return err
	}
	return nil
}

// clientUUID is this installation's identity to Archipelago servers, created once.
//
// The protocol wants a value that stays the same for one client across connections and
// differs between clients; the slot name is neither.
func clientUUID(dir, fallback string) string {
	if dir == "" {
		return fallback
	}
	path := filepath.Join(dir, "client-id")
	if data, err := os.ReadFile(path); err == nil && len(data) == 32 {
		return string(data)
	}
	raw := make([]byte, 16)
	if _, err := rand.Read(raw); err != nil {
		return fallback
	}
	id := hex.EncodeToString(raw)
	if err := os.MkdirAll(dir, 0o755); err == nil {
		_ = os.WriteFile(path, []byte(id), 0o600)
	}
	return id
}

// AppliedTotal is how many one-shot items, across the given ids, have been carried out.
func (s *Session) AppliedTotal(items ...int64) int {
	s.mu.Lock()
	defer s.mu.Unlock()
	total := 0
	for _, id := range items {
		total += s.Applied[itemKey(id)]
	}
	return total
}

// MailSigil is which Sigil (0 or 1) the player holds: the first to begin with, swapped
// by every delivery, and swapped once more if the player has corrected it.
func (s *Session) MailSigil(mailItems ...int64) int {
	sigil := s.AppliedTotal(mailItems...) % 2
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.MailFlipped {
		return 1 - sigil
	}
	return sigil
}

// FlipMail records that the player holds the other Sigil from the one the client assumed.
func (s *Session) FlipMail() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.MailFlipped = !s.MailFlipped
	if err := s.saveLocked(); err != nil {
		s.MailFlipped = !s.MailFlipped
		return err
	}
	return nil
}
