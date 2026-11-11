//go:build windows

package game

import (
	"encoding/binary"
	"fmt"
)

// A read-only walk of the game's monster units, for super-unique kill checks.
//
// d2go's own Monsters() reads the same table but follows every pointer it finds and can
// panic on a half-built unit (game.go avoids its GetData for that reason). This walk
// reads only fixed-size fields through ReadIntoBuffer, which reports a bad address as an
// error, and caps how far it follows each chain, so a unit freed mid-walk ends that
// chain instead of the app.
//
// Layout from d2go pkg/memory/monsters.go (2025-10). NOT yet confirmed on D2R 3.3: the
// first job of `d2rr-ap probe -monsters` is to show these reads give sane units.
const (
	// The unit table holds 128 hash buckets per unit type; monsters (type 1) follow the
	// players' 128.
	unitBuckets         = 128
	monsterTableOffset  = unitBuckets * 8
	offUnitTxt          = 0x04
	offUnitID           = 0x08
	offUnitData         = 0x10
	offUnitNext         = 0x158 // next unit in the same bucket
	offUnitCorpse       = 0x1AE // non-zero once the unit is a corpse
	offMonsterTypeFlags = 0x1A  // in the monster's unit data
	// A guard against a chain that loops or runs into freed memory.
	maxUnitsPerBucket = 1024

	// MonsterTypeSuperUnique is the unit data flag d2go reads as a super-unique.
	MonsterTypeSuperUnique = 10

	// Monster modes (monmode.txt): DT is dying, DD is dead.
	monsterModeDeath = 0
	monsterModeDead  = 12
)

// MonsterUnit is what the kill checks need from one monster.
type MonsterUnit struct {
	Addr   uintptr
	Txt    uint32 // monstats.txt row
	UnitID uint32
	Mode   uint32
	// TypeFlags is the unit data byte d2go reads as the monster's type; 10 is a
	// super-unique.
	TypeFlags byte
	Corpse    bool
}

// SuperUnique reports whether the unit is a super-unique (Bishibosh, Griswold, ...).
func (m MonsterUnit) SuperUnique() bool { return m.TypeFlags == MonsterTypeSuperUnique }

// Dead reports whether the unit is dying, dead or already a corpse.
func (m MonsterUnit) Dead() bool {
	return m.Corpse || m.Mode == monsterModeDeath || m.Mode == monsterModeDead
}

// Monsters lists the monster units the game holds near the player.
func (c *Client) Monsters() ([]MonsterUnit, error) {
	table := c.gr.ModuleBase() + c.gr.Offsets().UnitTable
	if c.gr.Offsets().UnitTable == 0 {
		return nil, fmt.Errorf("the unit table offset is not resolved")
	}
	return readMonsters(c.proc.ReadIntoBuffer, table+monsterTableOffset)
}

// readMonsters walks the monster buckets at table.
func readMonsters(read memoryRead, table uintptr) ([]MonsterUnit, error) {
	heads := make([]byte, unitBuckets*8)
	if err := read(table, heads); err != nil {
		return nil, fmt.Errorf("reading the monster table: %w", err)
	}
	var out []MonsterUnit
	for b := 0; b < unitBuckets; b++ {
		unit := uintptr(binary.LittleEndian.Uint64(heads[b*8:]))
		for n := 0; unit != 0 && n < maxUnitsPerBucket; n++ {
			m, next, ok := readMonster(read, unit)
			if !ok {
				break
			}
			out = append(out, m)
			unit = next
		}
	}
	return out, nil
}

// readMonster reads one unit, or ok false when any part of it cannot be read.
func readMonster(read memoryRead, unit uintptr) (m MonsterUnit, next uintptr, ok bool) {
	head := make([]byte, 0x18)
	if read(unit, head) != nil {
		return m, 0, false
	}
	m = MonsterUnit{
		Addr:   unit,
		Txt:    binary.LittleEndian.Uint32(head[offUnitTxt:]),
		UnitID: binary.LittleEndian.Uint32(head[offUnitID:]),
		Mode:   binary.LittleEndian.Uint32(head[offMode:]),
	}
	var b [8]byte
	if read(unit+offUnitNext, b[:]) != nil {
		return m, 0, false
	}
	next = uintptr(binary.LittleEndian.Uint64(b[:]))
	if read(unit+offUnitCorpse, b[:1]) != nil {
		return m, 0, false
	}
	m.Corpse = b[0] != 0
	if data := uintptr(binary.LittleEndian.Uint64(head[offUnitData:])); data != 0 {
		if read(data+offMonsterTypeFlags, b[:1]) == nil {
			m.TypeFlags = b[0]
		}
	}
	return m, next, true
}
