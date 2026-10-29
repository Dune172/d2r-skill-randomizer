//go:build windows

package game

import (
	"fmt"

	"github.com/hectorgimenez/d2go/pkg/data/stat"
)

const (
	// offMode is the unit's animation mode.
	offMode = 0x0C

	// Player modes that mean the character is dying or dead.
	modeDeath = 0
	modeDead  = 17

	// Life, mana and stamina are stored with eight fractional bits.
	VitalOne = 256
)

// townLevelIDs are the levels.txt ids of the five towns.
var townLevelIDs = map[int]bool{1: true, 40: true, 75: true, 103: true, 109: true}

// IsTown reports whether a levels.txt id is one of the five towns, where a character
// cannot be harmed and a trap would be either wasted or strange.
func IsTown(levelID int) bool { return townLevelIDs[levelID] }

// IsDead reports whether the player unit is dying or dead.
func (c *Client) IsDead(player uintptr) (bool, error) {
	mode, err := readUint(c.proc.ReadIntoBuffer, player+offMode, 4)
	if err != nil {
		return false, err
	}
	return mode == modeDeath || mode == modeDead, nil
}

// SpentStatPoints is how many attribute points the character has put in beyond what its
// class starts with.
//
// Read from the BASE stats, so equipment bonuses are not counted as spending.
func (c *Client) SpentStatPoints(player uintptr, classBase int) (int, error) {
	entries, err := c.BaseStats(player)
	if err != nil {
		return 0, err
	}
	return spentStatPoints(entries, classBase)
}

func spentStatPoints(entries []StatEntry, classBase int) (int, error) {
	total, found := 0, 0
	for _, e := range entries {
		if e.Layer != 0 {
			continue
		}
		switch e.ID {
		case stat.Strength, stat.Energy, stat.Dexterity, stat.Vitality:
			total += int(e.Value)
			found++
		}
	}
	// All four are always present on a character; a partial read must not look like a
	// respec that refunds everything.
	if found != 4 || total < classBase || total-classBase > 5*200 {
		return 0, fmt.Errorf("attribute read is implausible (%d of 4 found, total %d, class base %d)", found, total, classBase)
	}
	return total - classBase, nil
}

// TrapEffect is what a trap does to a stat: the stat to change and its new value given
// the current one.
type TrapEffect struct {
	Stat stat.ID
	New  func(current uint32) uint32
}

// VitalTraps are the traps that are nothing more than one stat write.
var (
	ManaBurn       = TrapEffect{stat.Mana, func(uint32) uint32 { return 0 }}
	Exhaustion     = TrapEffect{stat.Stamina, func(uint32) uint32 { return 0 }}
	BrushWithDeath = TrapEffect{stat.Life, func(cur uint32) uint32 {
		if cur < VitalOne {
			return cur // already below one life: never heal with a trap
		}
		return VitalOne
	}}
	GoldTax = TrapEffect{stat.Gold, func(cur uint32) uint32 { return cur - cur/4 }}
	// Kill is the DeathLink write: life to nothing.
	Kill = TrapEffect{stat.Life, func(uint32) uint32 { return 0 }}
)

// Apply carries out a trap effect. exists is false when the character has no such stat
// entry (no gold to tax, for instance), which is a no-op rather than a failure.
func (c *Client) Apply(player uintptr, effect TrapEffect) (exists bool, err error) {
	cur, ok, err := c.BaseStat(player, effect.Stat)
	if err != nil || !ok {
		return false, err
	}
	return c.SetPlayerStat(player, effect.Stat, effect.New(cur))
}

// GoldCapPerLevel is the most gold a character can carry, per character level.
const GoldCapPerLevel = 10000

// GoldAfter is the carried gold after a Gold item at this character level: a tenth of
// what the character can carry, never past the cap.
func GoldAfter(current uint32, level int) uint32 {
	if level < 1 {
		level = 1
	}
	limit := uint32(level * GoldCapPerLevel)
	next := current + limit/10
	if next > limit {
		next = limit
	}
	if next < current {
		return current // already over the cap somehow: never take gold away
	}
	return next
}
