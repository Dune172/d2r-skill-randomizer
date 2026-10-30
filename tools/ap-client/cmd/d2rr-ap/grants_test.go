//go:build windows

package main

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/Dune172/d2r-skill-randomizer/tools/ap-client/internal/apc"
	"github.com/Dune172/d2r-skill-randomizer/tools/ap-client/internal/game"
	"github.com/Dune172/d2r-skill-randomizer/tools/ap-client/internal/ids"
	"github.com/Dune172/d2r-skill-randomizer/tools/ap-client/internal/manifest"
	"github.com/hectorgimenez/d2go/pkg/data/stat"
)

const (
	keyStat = stat.ID(368)
	blood   = 2  // Blood Moor
	town    = 1  // Rogue Encampment
	paladin = 85 // starting strength + dexterity + energy + vitality
)

// fakeCharacter is a character made of a map: the stats it has entries for, where it
// stands, and whether it is dead. A stat with no entry cannot be written, as in the game;
// GivePlayerStat creates one while the stat list has room.
type fakeCharacter struct {
	stats map[stat.ID]uint32
	// room is how many entries can still be created; -1 is no limit.
	room   int
	area   int
	level  int
	dead   bool
	writes int
	// killable makes an emptied life pool a death, the way the client hopes the game works.
	killable bool
	// skillsSpent is the hard points in the class skills; skillsErr makes them unreadable.
	skillsSpent int
	skillsErr   error
}

func (f *fakeCharacter) SpentSkillPoints(uintptr, map[int]bool) (int, error) {
	return f.skillsSpent, f.skillsErr
}

func (f *fakeCharacter) SetUnspentSkillPoints(p uintptr, n int) (bool, error) {
	if n < 0 || n > game.MaxSkillPoints {
		return false, errors.New("out of range")
	}
	return f.SetPlayerStat(p, stat.SkillPoints, uint32(n))
}

func (f *fakeCharacter) BaseStat(_ uintptr, id stat.ID) (uint32, bool, error) {
	v, ok := f.stats[id]
	return v, ok, nil
}

func (f *fakeCharacter) SetPlayerStat(_ uintptr, id stat.ID, value uint32) (bool, error) {
	if _, ok := f.stats[id]; !ok {
		return false, nil
	}
	if f.stats[id] != value {
		f.writes++
	}
	f.stats[id] = value
	if id == stat.Life && value == 0 && f.killable {
		f.dead = true
	}
	return true, nil
}

func (f *fakeCharacter) GivePlayerStat(p uintptr, id stat.ID, value uint32, spare int) error {
	if _, ok := f.stats[id]; ok {
		_, err := f.SetPlayerStat(p, id, value)
		return err
	}
	if f.room >= 0 && f.room < 1+spare {
		return game.ErrNoRoom
	}
	if f.room > 0 {
		f.room--
	}
	f.stats[id] = value
	f.writes++
	return nil
}

func (f *fakeCharacter) SpentStatPoints(uintptr, int) (int, error) {
	total := 0
	for _, id := range []stat.ID{stat.Strength, stat.Energy, stat.Dexterity, stat.Vitality} {
		v, ok := f.stats[id]
		if !ok {
			return 0, errors.New("attributes unreadable")
		}
		total += int(v)
	}
	return total - paladin, nil
}

func (f *fakeCharacter) Apply(p uintptr, effect game.TrapEffect) (bool, error) {
	cur, ok := f.stats[effect.Stat]
	if !ok {
		return false, nil
	}
	return f.SetPlayerStat(p, effect.Stat, effect.New(cur))
}

func (f *fakeCharacter) IsDead(uintptr) (bool, error) { return f.dead, nil }

func (f *fakeCharacter) Progress() (game.Progress, bool) {
	return game.Progress{AreaLevelID: f.area, CharLevel: f.level}, f.area > 0
}

func freshCharacter() *fakeCharacter {
	return &fakeCharacter{area: blood, level: 10, room: -1, stats: map[stat.ID]uint32{
		stat.Strength: 25, stat.Energy: 15, stat.Dexterity: 20, stat.Vitality: 25,
		stat.StatPoints: 0, stat.SkillPoints: 0, stat.Gold: 500,
		stat.Life: 60 * game.VitalOne, stat.Mana: 20 * game.VitalOne, stat.Stamina: 90 * game.VitalOne,
		keyStat: 1,
	}}
}

// grantApp is an app wired to a fake character and a session holding the given items.
func grantApp(t *testing.T, char *fakeCharacter, items ...int64) (*app, *[]string) {
	t.Helper()
	session := apc.PendingSession(t.TempDir(), "Slot")
	if err := session.Bind("seed", 0, 1); err != nil {
		t.Fatal(err)
	}
	received := make([]apc.NetworkItem, len(items))
	for i, id := range items {
		received[i] = apc.NetworkItem{Item: id}
	}
	if _, err := session.ApplyReceivedItems(0, received); err != nil {
		t.Fatal(err)
	}
	tables := manifest.Tables{BaseAttributes: paladin, MessageBox: "ArchipelagoMessages"}
	tables.Stats.Keys = int(keyStat)
	deaths := &[]string{}
	a := &app{
		session: session, fakeGame: char, lastSeen: map[string]bool{},
		man:  &manifest.Manifest{Tables: tables},
		conn: apc.NewConn("127.0.0.1", 1, "Slot", "", session, apc.Handler{}),
	}
	a.sendDeath = func(_ context.Context, cause string) error {
		*deaths = append(*deaths, cause)
		return nil
	}
	return a, deaths
}

func poll(a *app) { a.applyGrants(context.Background(), 0x1000) }

func TestPooledStatPointsAreHeldAtSentMinusSpent(t *testing.T) {
	char := freshCharacter()
	a, _ := grantApp(t, char, ids.StatPointsItemID, ids.StatPointsItemID)
	a.statPointsPooled = true
	poll(a)
	if char.stats[stat.StatPoints] != 10 {
		t.Fatalf("two bundles unspent: %d", char.stats[stat.StatPoints])
	}
	// The player spends three; a level-up then hands them five the multiworld did not send.
	char.stats[stat.Strength] += 3
	char.stats[stat.StatPoints] = 7 + 5
	poll(a)
	if char.stats[stat.StatPoints] != 7 {
		t.Fatalf("level-up points must be taken back: %d", char.stats[stat.StatPoints])
	}
	// Spending past the entitlement never goes negative.
	char.stats[stat.Vitality] += 20
	poll(a)
	if char.stats[stat.StatPoints] != 0 {
		t.Fatalf("overspent: %d", char.stats[stat.StatPoints])
	}
}

func TestVanillaStatPointsAreLeftAlone(t *testing.T) {
	char := freshCharacter()
	char.stats[stat.StatPoints] = 15
	a, _ := grantApp(t, char, ids.StatPointsItemID)
	poll(a)
	if char.stats[stat.StatPoints] != 15 {
		t.Fatal("stat points were touched although the room does not pool them")
	}
}

func TestAnUnreadableAttributeNeverRefundsEverything(t *testing.T) {
	char := freshCharacter()
	char.stats[stat.StatPoints] = 4
	delete(char.stats, stat.Vitality)
	a, _ := grantApp(t, char, ids.StatPointsItemID, ids.StatPointsItemID)
	a.statPointsPooled = true
	poll(a)
	if char.stats[stat.StatPoints] != 4 {
		t.Fatalf("a failed read changed the stat points to %d", char.stats[stat.StatPoints])
	}
}

func TestKeysAreHeldAtCountPlusOne(t *testing.T) {
	char := freshCharacter()
	a, _ := grantApp(t, char, ids.HoradricKeyItemID, ids.HoradricKeyItemID)
	poll(a)
	if char.stats[keyStat] != 3 {
		t.Fatalf("two keys must read 3 (the Horadric Staff recipe's threshold): %d", char.stats[keyStat])
	}
	// Anything else that moves it is put back on the next poll.
	char.stats[keyStat]++
	poll(a)
	if char.stats[keyStat] != 3 {
		t.Fatalf("after a stray change: %d", char.stats[keyStat])
	}
}

// A fresh character has no key stat: the client creates it, with no potion to drink.
func TestAMissingKeyStatIsCreated(t *testing.T) {
	char := freshCharacter()
	delete(char.stats, keyStat)
	a, _ := grantApp(t, char, ids.HoradricKeyItemID)
	poll(a)
	if char.stats[keyStat] != 2 {
		t.Fatalf("one key must create the stat at 2, got %d (present %v)", char.stats[keyStat], char.stats[keyStat] != 0)
	}
}

// Pooled stat points on a character with no pool yet, or one spent to zero, arrive anyway.
func TestAnEmptiedStatPoolIsRecreated(t *testing.T) {
	char := freshCharacter()
	delete(char.stats, stat.StatPoints)
	a, _ := grantApp(t, char, ids.StatPointsItemID)
	a.statPointsPooled = true
	poll(a)
	if v, ok := char.stats[stat.StatPoints]; !ok || v != 5 {
		t.Fatalf("stat points: %d (entry %v), want 5", v, ok)
	}
}

// Nothing owed and no entry: nothing is created.
func TestNothingOwedCreatesNothing(t *testing.T) {
	char := freshCharacter()
	delete(char.stats, stat.StatPoints)
	a, _ := grantApp(t, char)
	a.statPointsPooled = true
	poll(a)
	if _, ok := char.stats[stat.StatPoints]; ok {
		t.Fatal("an empty stat-point pool was created with nothing to put in it")
	}
}

// A full stat list cannot take a new entry; the grant waits, loses nothing, and lands
// once the game has made room.
func TestAFullStatListWaitsAndLosesNothing(t *testing.T) {
	char := freshCharacter()
	char.room = 0
	delete(char.stats, keyStat)
	delete(char.stats, stat.Gold)
	a, _ := grantApp(t, char, ids.HoradricKeyItemID, ids.GoldItemID)
	poll(a)
	if _, ok := char.stats[keyStat]; ok {
		t.Fatal("a key stat appeared in a full list")
	}
	if a.session.Pending(ids.GoldItemID) != 1 {
		t.Fatal("gold was recorded as handed over with nowhere to put it")
	}
	if got := a.notes["keys"]; !strings.Contains(got, "make room") {
		t.Fatalf("the wait should be explained, got %q", got)
	}
	char.room = -1
	poll(a)
	if char.stats[keyStat] != 2 || a.session.Pending(ids.GoldItemID) != 0 || char.stats[stat.Gold] == 0 {
		t.Fatalf("after room: keys %d, gold %d pending %d", char.stats[keyStat], char.stats[stat.Gold], a.session.Pending(ids.GoldItemID))
	}
}

func TestGoldIsHandedOverOnceEach(t *testing.T) {
	char := freshCharacter()
	a, _ := grantApp(t, char, ids.GoldItemID, ids.GoldItemID)
	poll(a)
	poll(a)
	poll(a)
	if char.stats[stat.Gold] != 500+2*10000 || a.session.Pending(ids.GoldItemID) != 0 {
		t.Fatalf("gold %d, pending %d", char.stats[stat.Gold], a.session.Pending(ids.GoldItemID))
	}
}

// A character carrying no gold has no gold stat; the gold arrives anyway.
func TestGoldArrivesWithNoGoldHeld(t *testing.T) {
	char := freshCharacter()
	delete(char.stats, stat.Gold)
	a, _ := grantApp(t, char, ids.GoldItemID)
	poll(a)
	if a.session.Pending(ids.GoldItemID) != 0 || char.stats[stat.Gold] == 0 {
		t.Fatalf("gold %d, pending %d", char.stats[stat.Gold], a.session.Pending(ids.GoldItemID))
	}
}

func TestTrapsWaitOutsideTownAndSpringOneAtATime(t *testing.T) {
	char := freshCharacter()
	char.area = town
	trap := func(k ids.Trap) int64 { return ids.TrapIDBase + int64(k) }
	a, _ := grantApp(t, char, trap(ids.TrapManaBurn), trap(ids.TrapExhaustion), trap(ids.TrapBrushWithDeath),
		trap(ids.TrapGoldTax), trap(ids.TrapSkillLock))
	poll(a)
	if char.stats[stat.Mana] == 0 || a.session.Pending(trap(ids.TrapManaBurn)) != 1 {
		t.Fatal("a trap sprang in town")
	}

	char.area = blood
	poll(a)
	if char.stats[stat.Mana] != 0 || char.stats[stat.Stamina] == 0 {
		t.Fatalf("exactly one trap a poll: mana %d stamina %d", char.stats[stat.Mana], char.stats[stat.Stamina])
	}
	// In id order: Exhaustion, Brush with Death, Skill Lock, Gold Tax.
	poll(a)
	poll(a)
	if char.stats[stat.Stamina] != 0 || char.stats[stat.Life] != game.VitalOne {
		t.Fatalf("stamina %d life %d", char.stats[stat.Stamina], char.stats[stat.Life])
	}
	if !a.skillLockUntil.IsZero() || char.stats[stat.Gold] != 500 {
		t.Fatal("a later trap sprang early")
	}
	poll(a)
	if until := time.Until(a.skillLockUntil); until < 50*time.Second || until > skillLockDuration {
		t.Fatalf("skill lock lasts %s", until)
	}
	poll(a)
	if char.stats[stat.Gold] != 375 {
		t.Fatalf("gold after the tax: %d", char.stats[stat.Gold])
	}
	for k := range ids.Traps {
		if a.session.Pending(trap(ids.Trap(k))) != 0 {
			t.Fatalf("%s is still owed", ids.Traps[k])
		}
	}
	writes := char.writes
	poll(a)
	if char.writes != writes {
		t.Fatal("a trap sprang twice")
	}
}

func TestNothingLandsOnACorpse(t *testing.T) {
	char := freshCharacter()
	char.dead = true
	a, _ := grantApp(t, char, ids.GoldItemID, ids.TrapIDBase+int64(ids.TrapManaBurn))
	poll(a)
	if char.stats[stat.Gold] != 500 || char.stats[stat.Mana] == 0 {
		t.Fatal("gold or a trap was applied to a dead character")
	}
}

func TestADeathIsSentOncePerDeathAndOnlyWithDeathLink(t *testing.T) {
	char := freshCharacter()
	a, deaths := grantApp(t, char)
	char.dead = true
	poll(a)
	if len(*deaths) != 0 {
		t.Fatal("a death was sent although DeathLink is off")
	}
	char.dead = false
	poll(a)

	a.deathLink = true
	char.dead = true
	poll(a)
	poll(a)
	poll(a)
	if len(*deaths) != 1 {
		t.Fatalf("one death, sent %d times", len(*deaths))
	}
	char.dead = false
	poll(a)
	char.dead = true
	poll(a)
	if len(*deaths) != 2 {
		t.Fatalf("a second death was not sent: %d", len(*deaths))
	}
}

func TestAnIncomingDeathKillsOutsideTownAndIsNotEchoed(t *testing.T) {
	char := freshCharacter()
	char.killable = true
	char.area = town
	a, deaths := grantApp(t, char)
	a.deathLink = true
	a.pendingDeaths = 1

	poll(a)
	if char.dead {
		t.Fatal("a death was applied in town")
	}
	char.area = blood
	poll(a)
	if !char.dead || char.stats[stat.Life] != 0 {
		t.Fatal("the incoming death did not kill")
	}
	poll(a)
	if a.pendingDeaths != 0 {
		t.Fatalf("the death is still pending: %d", a.pendingDeaths)
	}
	if len(*deaths) != 0 {
		t.Fatalf("a death caused by DeathLink was sent back to the room: %v", *deaths)
	}
	// Having respawned, a death of the player's own is sent again as usual.
	char.dead, char.stats[stat.Life] = false, 60*game.VitalOne
	poll(a)
	char.dead = true
	poll(a)
	if len(*deaths) != 1 {
		t.Fatalf("the player's own later death was not sent: %d", len(*deaths))
	}
}

func TestAGameThatIgnoresTheKillFallsBackToOneLife(t *testing.T) {
	char := freshCharacter() // not killable: emptying life does nothing
	a, deaths := grantApp(t, char)
	a.deathLink = true
	a.pendingDeaths = 2

	poll(a)
	if char.stats[stat.Life] != 0 || a.killStarted.IsZero() {
		t.Fatal("the kill was not attempted")
	}
	char.stats[stat.Life] = 30 * game.VitalOne // the game regenerates; the character lives
	poll(a)
	if a.killUnsupported {
		t.Fatal("gave up before the grace period")
	}
	a.killStarted = time.Now().Add(-2 * killGrace)
	poll(a)
	if !a.killUnsupported {
		t.Fatal("did not notice the game ignored the kill")
	}
	poll(a)
	if char.stats[stat.Life] != game.VitalOne || a.pendingDeaths != 1 {
		t.Fatalf("fallback: life %d, pending %d", char.stats[stat.Life], a.pendingDeaths)
	}
	char.stats[stat.Life] = 30 * game.VitalOne
	poll(a)
	if char.stats[stat.Life] != game.VitalOne || a.pendingDeaths != 0 {
		t.Fatalf("second death: life %d, pending %d", char.stats[stat.Life], a.pendingDeaths)
	}
	if len(*deaths) != 0 {
		t.Fatal("a fallback was reported to the room as a death")
	}
}

// With one free slot left, gold waits so a point pool or the key stat can have it.
func TestGoldLeavesTheLastSlotForPoints(t *testing.T) {
	char := freshCharacter()
	char.room = 1
	delete(char.stats, keyStat)
	delete(char.stats, stat.Gold)
	a, _ := grantApp(t, char, ids.GoldItemID)
	poll(a)
	if _, ok := char.stats[stat.Gold]; ok || a.session.Pending(ids.GoldItemID) != 1 {
		t.Fatal("gold took the last free slot")
	}
	a2, _ := grantApp(t, char, ids.HoradricKeyItemID)
	poll(a2)
	if char.stats[keyStat] != 2 {
		t.Fatalf("the key stat should take the last slot: %d", char.stats[keyStat])
	}
}
