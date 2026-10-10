package game

import (
	"fmt"

	"github.com/hectorgimenez/d2go/pkg/data/stat"
)

// Granting UNSPENT SKILL POINTS, so the game allocates the skill itself.
//
// The game builds the skill when the player spends the point, so it is real by
// construction: auras work, summons work, the action bar lists it, and it serialises
// into the save. Nothing foreign is ever linked into the character.
//
// The cost is that Archipelago does not choose WHICH skill: the player spends the
// point. That is a game-design trade, not a technical one.

// UnspentSkillPoints reports the character's unspent skill points, and whether the stat
// exists at all.
func (c *Client) UnspentSkillPoints(player uintptr) (int, bool) {
	v, ok, err := c.BaseStat(player, stat.SkillPoints)
	return int(v), ok && err == nil
}

// SetUnspentSkillPoints writes the unspent skill point count.
//
// Returns false when the stat has no entry yet. That is normal on a fresh character —
// the game creates it on the first level-up — and must not be treated as an error, only
// as "not yet".
func (c *Client) SetUnspentSkillPoints(player uintptr, n int) (bool, error) {
	if n < 0 || n > MaxSkillPoints {
		return false, fmt.Errorf("unspent point target out of range: %d", n)
	}
	return c.SetBaseStat(player, stat.SkillPoints, uint32(n))
}

// SpentSkillPoints sums the hard points the character has put into the given skills.
//
// Only the AP class's own 30 skills count. Innate skills (Attack, Kick, Throw) and
// nonclass skills are excluded. Duplicate class nodes pause reconciliation; other
// equipment-provided representations require live validation.
func (c *Client) SpentSkillPoints(player uintptr, classSkillIDs map[int]bool) (int, error) {
	nodes, err := c.Skills(player)
	if err != nil {
		return 0, err
	}
	return CountHardPoints(nodes, classSkillIDs)
}
