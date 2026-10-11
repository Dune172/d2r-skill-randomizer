// Archipelago companion client for D2R Randomizer.
//
//   - the save file and the running game are read for location checks
//   - grants are made only by changing the value of a stat the game already holds
//
// The client never writes a .d2s and never builds a game structure of its own.
module github.com/swannysoft/d2rr-ap-client

go 1.23

require (
	github.com/coder/websocket v1.8.15
	github.com/hectorgimenez/d2go v0.0.0-20251023061335-16d248a53591
	golang.org/x/sys v0.24.0
)
