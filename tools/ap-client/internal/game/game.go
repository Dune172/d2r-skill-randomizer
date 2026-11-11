//go:build windows

// Package game reads D2R state and reconciles the character's Archipelago grants.
//
// The client never builds game structures of its own. It reads the player unit, writes
// stat values, adds a missing stat entry only in space the game already allocated for
// it, and writes text into the mod's own message box in the buffer the game gave it.
package game

import (
	"fmt"
	"time"

	"github.com/hectorgimenez/d2go/pkg/memory"
	"golang.org/x/sys/windows"
)

// Player unit layout, from d2go pkg/memory/player.go.
const (
	offSkillList = 0x100
	offClass     = 0x17C
)

// Skill node layout, measured across 9 live nodes.
const (
	nodeSize  = 0x50
	nodeNext  = 0x08 // pNextSkill
	nodeLevel = 0x38 // u16 hard points

	// A D2 character caps at 20 hard points per skill.
	MaxSkillLevel = 20
)

// SkillNode is one entry in the player's skill list.
type SkillNode struct {
	ID    uint16
	Level uint16
}

// Client is an attached D2R process.
type Client struct {
	proc *memory.Process
	gr   *memory.GameReader

	// The game's own copy of the player (see SimulationCopy), cached for simFor.
	simFor, sim uintptr

	// The Esc menu's panel, found by name, and when to look for it again.
	pausePanel      uintptr
	pausePanelRetry time.Time
}

// Attach finds and opens the running D2R process.
func Attach() (*Client, error) {
	proc, err := memory.NewProcess()
	if err != nil {
		return nil, fmt.Errorf("attaching to D2R: %w (is the game running?)", err)
	}
	return &Client{proc: proc, gr: memory.NewGameReader(proc)}, nil
}

func (c *Client) Close() error { return c.proc.Close() }

// OffsetsResolved reports whether d2go found the UI flag block and the live waypoint
// panel. Both are pattern-scanned at attach, with measured fallbacks for known D2R builds
// (see BuildTimestamp). On an unknown build a pattern can miss until its code page has
// run, and only a fresh attach scans again.
func (c *Client) OffsetsResolved() (ui, waypoints bool) {
	o := c.gr.Offsets()
	return o.UI != 0, o.WaypointsOffset != 0
}

// BuildTimestamp is the PE TimeDateStamp of the running D2R.exe, which names the build.
func (c *Client) BuildTimestamp() uint32 { return c.proc.PETimestamp() }

// KnownBuild reports whether the vendored d2go has measured offsets for this build.
func KnownBuild(timestamp uint32) bool { return memory.KnownBuild(timestamp) }

// IsOnline reports whether D2R looks like it is on Battle.net.
//
// The client must refuse to touch an online session: memory tooling is what gets
// accounts banned. D2R mods are offline-only anyway, so this should never fire in
// normal use — it is enforcement, not trust.
func (c *Client) IsOnline() bool { return c.gr.IsOnline() }

// PlayerUnit resolves the local player, or 0 when not in a game.
//
// Deliberately NOT gated on IsIngame(): on the tested D2R build it reports false while
// the player is demonstrably in a game world (area resolved, unit walkable). Resolving
// a unit is the condition we actually need, and it is self-validating.
//
// Also avoids GetData(), which additionally reads inventory/monsters/objects and panics
// on an empty slice when the game is between states.
func (c *Client) PlayerUnit() uintptr {
	return c.gr.GetRawPlayerUnits().GetMainPlayer().Address
}

// Skills walks the player's skill list.
func (c *Client) Skills(player uintptr) ([]SkillNode, error) {
	return readSkills(c.proc.ReadIntoBuffer, player)
}

// uiQuitMenuByte is the index in the UI block that tracks the quit menu.
//
// MEASURED, not taken from d2go. The index happens to be the same one d2go uses, but its
// SENSE is inverted: this byte reads 1 during normal play and drops to 0 when the quit
// menu opens. Opening the INVENTORY leaves it at 1, so it tracks the quit menu
// specifically rather than "some panel is up". Byte 0x12 moves alongside it and is
// deliberately unused, because it does fire on the inventory.
const uiQuitMenuByte = 0x09

// QuitMenuByte reports the old UI-block reading, for the playtest probe. It is not used
// to gate writes any more: on D2R 3.4 it stopped tracking the menu after a death.
func (c *Client) QuitMenuByte() bool {
	buf := c.UIBuffer()
	return len(buf) <= uiQuitMenuByte || buf[uiQuitMenuByte] == 0
}

// The Esc ("pause") menu is a panel in the game's UI tree that is visible exactly while
// the menu is open. Measured on D2R 3.4.95032, where the UI-block byte above went to 0 for
// good after the character died, which paused every grant for the rest of the game.
const (
	pausePanelName  = "PauseLayoutGarden"
	offPanelVisible = 0x51 // d2go pkg/memory/panels.go
)

// QuitMenuOpen pauses reconciliation while the Esc menu is open, read from the pause
// panel's visibility. Until the panel has been found (the UI tree is still being built)
// it reports true, so nothing is written to a game that may be half there.
func (c *Client) QuitMenuOpen() bool {
	if c.pausePanel == 0 || !c.WidgetNamed(c.pausePanel, pausePanelName) {
		c.pausePanel = 0
		if time.Now().Before(c.pausePanelRetry) {
			return true
		}
		// Finding it walks the whole UI tree, so a miss waits a moment before the next try.
		c.pausePanelRetry = time.Now().Add(2 * time.Second)
		addr, err := c.FindWidget(pausePanelName)
		if err != nil {
			return true
		}
		c.pausePanel = addr
	}
	var visible [1]byte
	if err := c.proc.ReadIntoBuffer(c.pausePanel+offPanelVisible, visible[:]); err != nil {
		return true
	}
	return visible[0] != 0
}

func (c *Client) openWrite() (windows.Handle, error) {
	h, err := windows.OpenProcess(
		windows.PROCESS_VM_WRITE|windows.PROCESS_VM_OPERATION|windows.PROCESS_VM_READ,
		false, c.proc.GetPID())
	if err != nil {
		return 0, fmt.Errorf("OpenProcess: %w (try an elevated terminal)", err)
	}
	return h, nil
}
