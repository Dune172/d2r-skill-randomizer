package game

import (
	"encoding/binary"
)

// The live waypoint panel, read straight out of D2R rather than out of the save.
//
// WHY THIS EXISTS. D2R does not write the .d2s when you take a waypoint — only on
// save-and-exit and a handful of events — so a save-derived waypoint check can lag an
// entire play session. Measured against a hosted room: a waypoint taken mid-session did
// not reach the server until the player saved and exited. Solo that is merely odd; in a
// multiworld it means the item behind that check sits with the person who found it
// instead of reaching whoever it belongs to.
//
// The panel is 9 entries of {areaID uint32, available uint32}. NINE, not 39: it holds
// the CURRENT ACT only, which is why this supplements the save rather than replacing it.
// Waypoints in acts you are not standing in still arrive the slow way.
const (
	waypointPanelEntries = 9
	waypointPanelStride  = 8
	waypointPanelSize    = waypointPanelEntries * waypointPanelStride // 0x48
)

// AvailableWaypointAreaIDs returns the levels.txt Ids of the waypoints currently
// ACTIVATED in the panel, for the act the player is in.
//
// Deliberately stricter than d2go's own reader, which also counts the area the player is
// standing in. Standing on a waypoint is not the same as having activated it, and the
// difference is a check sent one step early that can never be taken back.
func (c *Client) AvailableWaypointAreaIDs() []int {
	offset := c.gr.Offsets().WaypointsOffset
	if offset == 0 {
		return nil // unresolved: module+0 is the PE header, not a waypoint panel
	}
	base := c.gr.ModuleBase() + offset
	buf := c.proc.ReadBytesFromMemory(base, waypointPanelSize)
	if len(buf) < waypointPanelSize {
		return nil
	}

	var out []int
	for i := 0; i < waypointPanelSize; i += waypointPanelStride {
		areaID := binary.LittleEndian.Uint32(buf[i : i+4])
		available := binary.LittleEndian.Uint32(buf[i+4 : i+8])
		// A zero area is an empty slot: Act IV has only 3 waypoints in a 9-slot panel.
		if areaID == 0 || available != 1 {
			continue
		}
		out = append(out, int(areaID))
	}
	return out
}

// UIBufferSize is how much of the UI flag block d2go reads.
const UIBufferSize = 0x16D

// UIBuffer returns the raw UI flag bytes, for recalibrating flags that read wrong.
//
// Every flag derived from offset.UI is untrustworthy on the tested build — quitMenu
// reads TRUE while in a game and ingame reads FALSE — so nothing load-bearing may depend
// on d2go's interpretation of these. The bytes themselves are still real; what is
// unknown is which index means what. Diff this across a known UI action (open the quit
// menu, close it) and the byte that flips is the answer.
func (c *Client) UIBuffer() []byte {
	offset := c.gr.Offsets().UI
	if offset == 0 {
		return nil // unresolved: reading module+0-0xA would not be the UI block
	}
	base := c.gr.ModuleBase() + offset - 0xA
	buf := make([]byte, UIBufferSize)
	if err := c.proc.ReadIntoBuffer(base, buf); err != nil {
		return nil
	}
	return buf
}
