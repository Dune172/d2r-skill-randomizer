//go:build windows

package game

import "testing"

func TestReadMonstersWalksBucketsAndStopsAtBadUnits(t *testing.T) {
	m := fakeMemory{}
	table := uintptr(0x1000)
	for b := 0; b < unitBuckets; b++ {
		m.u64(table+uintptr(b*8), 0)
	}
	unit := func(addr uintptr, txt, id, mode uint32, next uintptr, corpse, flags byte) {
		m.put(addr, make([]byte, 0x200))
		m.u32(addr+offUnitTxt, txt)
		m.u32(addr+offUnitID, id)
		m.u32(addr+offMode, mode)
		m.u64(addr+offUnitNext, uint64(next))
		m.put(addr+offUnitCorpse, []byte{corpse})
		data := addr + 0x1000
		m.u64(addr+offUnitData, uint64(data))
		m.put(data+offMonsterTypeFlags, []byte{flags})
	}
	// Bucket 3: Bishibosh (super-unique, alive), then a dead fallen; bucket 9 points at
	// memory that cannot be read.
	unit(0x10000, 4, 77, 1, 0x20000, 0, MonsterTypeSuperUnique)
	unit(0x20000, 19, 78, monsterModeDead, 0, 1, 0)
	m.u64(table+3*8, 0x10000)
	m.u64(table+9*8, 0xdead0000)

	got, err := readMonsters(m.read, table)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 {
		t.Fatalf("%d units: %+v", len(got), got)
	}
	if !got[0].SuperUnique() || got[0].Dead() || got[0].UnitID != 77 || got[0].Txt != 4 {
		t.Fatalf("first %+v", got[0])
	}
	if got[1].SuperUnique() || !got[1].Dead() || !got[1].Corpse {
		t.Fatalf("second %+v", got[1])
	}
	if _, err := readMonsters(m.read, 0x9999); err == nil {
		t.Fatal("an unreadable table was not an error")
	}
}

func TestAChainThatLoopsEnds(t *testing.T) {
	m := fakeMemory{}
	table := uintptr(0x1000)
	for b := 0; b < unitBuckets; b++ {
		m.u64(table+uintptr(b*8), 0)
	}
	m.put(0x10000, make([]byte, 0x200))
	m.u64(0x10000+offUnitNext, 0x10000) // points at itself
	m.u64(table, 0x10000)
	got, err := readMonsters(m.read, table)
	if err != nil || len(got) != maxUnitsPerBucket {
		t.Fatalf("%d units, %v", len(got), err)
	}
}
