//go:build windows

package game

import (
	"encoding/binary"
	"fmt"
	"github.com/hectorgimenez/d2go/pkg/data/stat"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

type fakeMemory map[uintptr]byte

func (m fakeMemory) read(addr uintptr, b []byte) error {
	for i := range b {
		v, ok := m[addr+uintptr(i)]
		if !ok {
			return fmt.Errorf("unreadable %x", addr)
		}
		b[i] = v
	}
	return nil
}
func (m fakeMemory) put(addr uintptr, b []byte) {
	for i, v := range b {
		m[addr+uintptr(i)] = v
	}
}
func (m fakeMemory) u64(addr uintptr, v uint64) {
	b := make([]byte, 8)
	binary.LittleEndian.PutUint64(b, v)
	m.put(addr, b)
}
func (m fakeMemory) u32(addr uintptr, v uint32) {
	b := make([]byte, 4)
	binary.LittleEndian.PutUint32(b, v)
	m.put(addr, b)
}
func classIDs() map[int]bool {
	m := map[int]bool{}
	for i := 100; i < 130; i++ {
		m[i] = true
	}
	return m
}
func TestPointBalances(t *testing.T) {
	for _, v := range []struct{ received, spent, want, debt, excess int }{{10, 0, 10, 0, 0}, {10, 4, 6, 0, 0}, {10, 0, 10, 0, 0}, {5, 8, 0, 3, 0}, {800, 590, 10, 0, 200}, {600, 600, 0, 0, 0}} {
		b, e := Balance(v.received, v.spent)
		if e != nil || b.Unspent != v.want || b.Debt != v.debt || b.Excess != v.excess {
			t.Fatalf("%+v %v", b, e)
		}
	}
	if _, e := Balance(10, 601); e == nil {
		t.Fatal("impossible hard points accepted")
	}
}
func TestHardPointAccountingRefusesEquipmentAmbiguity(t *testing.T) {
	nodes := []SkillNode{{ID: 0, Level: 1}, {ID: 100, Level: 4}, {ID: 101, Level: 0}}
	if total, e := CountHardPoints(nodes, classIDs()); e != nil || total != 4 {
		t.Fatalf("%d %v", total, e)
	}
	for _, extra := range []SkillNode{{ID: 100, Level: 3}, {ID: 102, Level: 21}} {
		if _, e := CountHardPoints(append(nodes, extra), classIDs()); e == nil {
			t.Fatal("accepted ambiguous skill")
		}
	}
}
func TestSkillReadFailuresDoNotBecomeZeroPoints(t *testing.T) {
	m := fakeMemory{}
	m.u64(0x10000+offSkillList, 0x20000)
	m.u64(0x20000, 0x30000)
	if _, e := readSkills(m.read, 0x10000); e == nil {
		t.Fatal("accepted unreadable node")
	}
	b := make([]byte, nodeSize)
	binary.LittleEndian.PutUint64(b, 0x40000)
	binary.LittleEndian.PutUint64(b[8:], 0x30000)
	m.put(0x30000, b)
	m.put(0x40000, []byte{100, 0})
	if _, e := readSkills(m.read, 0x10000); e == nil {
		t.Fatal("accepted cyclic list")
	}
	binary.LittleEndian.PutUint64(b[8:], 0)
	binary.LittleEndian.PutUint16(b[nodeLevel:], 4)
	m.put(0x30000, b)
	if n, e := readSkills(m.read, 0x10000); e != nil || len(n) != 1 || n[0].Level != 4 {
		t.Fatalf("%v %v", n, e)
	}
}
func TestSparseStatDistinguishesMissingFromReadFailure(t *testing.T) {
	m := fakeMemory{}
	m.u64(0x10000+offStatsListEx, 0x20000)
	m.u64(0x20000+statBaseList, 0x30000)
	m.u64(0x20000+statBaseList+statListCount, 1)
	m.u64(0x20000+statBaseList+statListCapacity, 4)
	if _, _, _, e := readBaseStat(m.read, 0x10000, stat.SkillPoints); e == nil {
		t.Fatal("read failure hidden")
	}
	b := make([]byte, 8)
	binary.LittleEndian.PutUint16(b[2:], uint16(stat.Level))
	m.put(0x30000, b)
	if _, _, ok, e := readBaseStat(m.read, 0x10000, stat.SkillPoints); e != nil || ok {
		t.Fatalf("missing stat: %v %v", ok, e)
	}
	binary.LittleEndian.PutUint16(b[2:], uint16(stat.SkillPoints))
	binary.LittleEndian.PutUint32(b[4:], 3)
	m.put(0x30000, b)
	if _, v, ok, e := readBaseStat(m.read, 0x10000, stat.SkillPoints); e != nil || !ok || v != 3 {
		t.Fatalf("%d %v %v", v, ok, e)
	}
}
func TestDifficultyRequiresDistinctEvidence(t *testing.T) {
	p := DifficultyProfile{}
	p.Observe(0, map[string]int{"a": 0, "b": 0})
	if _, ok := p.Layout(); ok {
		t.Fatal("one Normal sample is not proof")
	}
	p.Observe(1, map[string]int{"a": 1, "b": 0})
	if layout, ok := p.Layout(); !ok || layout != "a" {
		t.Fatal("did not resolve unique candidate")
	}
	if v, ok := p.Resolve(map[string]int{"a": 0}); !ok || v != 0 {
		t.Fatal("farming Normal was mislabeled")
	}
	if _, ok := p.Resolve(map[string]int{}); ok {
		t.Fatal("missing memory was accepted")
	}
	p.Observe(1, map[string]int{"a": 1, "b": 1})
	if _, ok := p.Layout(); ok {
		t.Fatal("ambiguous candidates accepted")
	}
}

func TestRejectedDifficultyProfileCannotResolve(t *testing.T) {
	dir := t.TempDir()
	build := strings.Repeat("a", 64)
	raw := []byte("{\"executableSHA256\":\"wrong-build\",\"samples\":{\"0\":{\"a\":0},\"1\":{\"a\":1}}}")
	if err := os.WriteFile(filepath.Join(dir, "difficulty-"+build+".json"), raw, 0600); err != nil {
		t.Fatal(err)
	}
	p, err := LoadDifficultyProfile(dir, build)
	if err == nil {
		t.Fatal("accepted another executable's calibration")
	}
	if _, ok := p.Resolve(map[string]int{"a": 1}); ok {
		t.Fatal("rejected profile retained usable samples")
	}
}

func TestUnitHeaderMatchesOnlyAlignedExactHeaders(t *testing.T) {
	buf := make([]byte, 64)
	put := func(off int, typ, class, id uint32) {
		binary.LittleEndian.PutUint32(buf[off:], typ)
		binary.LittleEndian.PutUint32(buf[off+4:], class)
		binary.LittleEndian.PutUint32(buf[off+8:], id)
	}
	put(8, 0, 3, 77)  // the player
	put(24, 1, 3, 77) // a monster with the same id
	put(40, 0, 4, 77) // another class
	put(52, 0, 3, 77) // right bytes, wrong alignment
	got := unitHeaderMatches(buf, 3, 77)
	if len(got) != 1 || got[0] != 8 {
		t.Fatalf("matches %v, want [8]", got)
	}
}

func TestSpentStatPointsCountsOnlyAttributesOverTheClassBase(t *testing.T) {
	attrs := func(str, ene, dex, vit uint32) []StatEntry {
		return []StatEntry{
			{ID: stat.Strength, Value: str}, {ID: stat.Energy, Value: ene},
			{ID: stat.Dexterity, Value: dex}, {ID: stat.Vitality, Value: vit},
			{ID: stat.Life, Value: 99999}, {ID: stat.Strength, Layer: 1, Value: 500},
		}
	}
	if got, err := spentStatPoints(attrs(25, 15, 20, 25), 85); err != nil || got != 0 {
		t.Fatalf("fresh paladin: %d %v", got, err)
	}
	if got, err := spentStatPoints(attrs(30, 15, 20, 45), 85); err != nil || got != 25 {
		t.Fatalf("25 spent: %d %v", got, err)
	}
	// A partial or nonsensical read must be an error, never "nothing spent".
	if _, err := spentStatPoints(attrs(25, 15, 20, 25)[:3], 85); err == nil {
		t.Fatal("accepted three attributes")
	}
	if _, err := spentStatPoints(attrs(1, 1, 1, 1), 85); err == nil {
		t.Fatal("accepted a total below the class base")
	}
}

func TestTrapEffectsNeverHelpThePlayer(t *testing.T) {
	if ManaBurn.New(5000) != 0 || Exhaustion.New(5000) != 0 || Kill.New(5000) != 0 {
		t.Fatal("drain traps must empty the stat")
	}
	if BrushWithDeath.New(50000) != VitalOne {
		t.Fatal("Brush with Death leaves exactly one life")
	}
	if BrushWithDeath.New(100) != 100 {
		t.Fatal("Brush with Death must not raise life that is already below one")
	}
	if GoldTax.New(1000) != 750 || GoldTax.New(0) != 0 || GoldTax.New(3) != 3 {
		t.Fatalf("gold tax: %d %d %d", GoldTax.New(1000), GoldTax.New(0), GoldTax.New(3))
	}
}

func TestGoldItemsRespectTheCarryCap(t *testing.T) {
	if got := GoldAfter(0, 10); got != 10000 {
		t.Fatalf("level 10 from nothing: %d", got)
	}
	if got := GoldAfter(95000, 10); got != 100000 {
		t.Fatalf("must stop at the cap: %d", got)
	}
	if got := GoldAfter(250000, 10); got != 250000 {
		t.Fatalf("must never take gold away: %d", got)
	}
	if got := GoldAfter(0, 0); got != 1000 {
		t.Fatalf("an unknown level counts as level 1: %d", got)
	}
}

func TestTownsAreTheFiveTowns(t *testing.T) {
	for id, want := range map[int]bool{1: true, 2: false, 40: true, 75: true, 103: true, 109: true, 108: false, 0: false} {
		if IsTown(id) != want {
			t.Errorf("IsTown(%d) = %v", id, !want)
		}
	}
}
