//go:build windows

package game

import (
	"github.com/hectorgimenez/d2go/pkg/data/stat"
)

// Progress is the run state that only memory can supply.
//
// The .d2s records quests and waypoints, but nothing about where the character is
// standing — D2R keeps automap state in opaque sibling files — and its stats section is
// bit-packed rather than parsed here. Both are already sitting in the player unit d2go
// reads for us, so area and character level cost no new offsets and no new pattern
// scans: the same unit-table walk that finds the skill list carries them.
type Progress struct {
	// AreaLevelID is the levels.txt Id of the area the player is in. Zero means the
	// unit resolved but has no area yet, which happens between game states.
	AreaLevelID int
	// CharLevel is the character's level, 1-99.
	CharLevel int
}

// Progress reads the player's current area and character level.
//
// Reports false rather than a zero value when the player is not in a game, so a caller
// can never mistake "not loaded" for "area 0, level 0" and send a bogus check.
func (c *Client) Progress() (Progress, bool) {
	units := c.gr.GetRawPlayerUnits()
	main := units.GetMainPlayer()
	if main.Address == 0 {
		return Progress{}, false
	}

	p := Progress{AreaLevelID: int(main.Area)}

	// BaseStats FIRST. d2go reads two stat lists off the unit — +0x30 as BaseStats and
	// +0xA8 as Stats — and character level lives in the former. Measured on a live
	// Paladin: Stats had ZERO entries while BaseStats had 18, including Level.
	//
	// Reading only Stats yielded level 0, which this function treated as "not loaded
	// yet" and reported as failure — silently disabling AREA checks as well, since both
	// depend on this one call. Try both rather than betting on either.
	if lvl, ok := main.BaseStats.FindStat(stat.Level, 0); ok {
		p.CharLevel = lvl.Value
	} else if lvl, ok := main.Stats.FindStat(stat.Level, 0); ok {
		p.CharLevel = lvl.Value
	}

	// The area is the only hard requirement: zero means the world is not up yet, and a
	// check sent off a half-loaded unit cannot be taken back. A missing level is NOT
	// fatal — it leaves CharLevel at 0, which the milestone loop skips over — because
	// coupling the two is exactly what hid this bug.
	return p, p.AreaLevelID > 0
}
