package main

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/hectorgimenez/d2go/pkg/data/stat"
	"github.com/swannysoft/d2rr-ap-client/internal/apc"
	"github.com/swannysoft/d2rr-ap-client/internal/game"
	"github.com/swannysoft/d2rr-ap-client/internal/ids"
	"github.com/swannysoft/d2rr-ap-client/internal/manifest"
)

const (
	keyStat  = stat.ID(368)
	mailStat = stat.ID(369)
	blood    = 2  // Blood Moor
	town     = 1  // Rogue Encampment
	paladin  = 85 // starting strength + dexterity + energy + vitality
)

// fakeCharacter is a character made of a map: the stats it has entries for, where it
// stands, and whether it is dead. A stat with no entry cannot be written, as in the game.
type fakeCharacter struct {
	stats  map[stat.ID]uint32
	area   int
	level  int
	dead   bool
	writes int
	// killable makes an emptied life pool a death, the way the client hopes the game works.
	killable bool
}

func (f *fakeCharacter) BaseStat(_ uintptr, id stat.ID) (uint32, bool, error) {
	v, ok := f.stats[id]
	return v, ok, nil
}

func (f *fakeCharacter) SetBaseStat(_ uintptr, id stat.ID, value uint32) (bool, error) {
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
	return f.SetBaseStat(p, effect.Stat, effect.New(cur))
}

func (f *fakeCharacter) IsDead(uintptr) (bool, error) { return f.dead, nil }

func (f *fakeCharacter) Progress() (game.Progress, bool) {
	return game.Progress{AreaLevelID: f.area, CharLevel: f.level}, f.area > 0
}

func freshCharacter() *fakeCharacter {
	return &fakeCharacter{area: blood, level: 10, stats: map[stat.ID]uint32{
		stat.Strength: 25, stat.Energy: 15, stat.Dexterity: 20, stat.Vitality: 25,
		stat.StatPoints: 0, stat.SkillPoints: 0, stat.Gold: 500,
		stat.Life: 60 * game.VitalOne, stat.Mana: 20 * game.VitalOne, stat.Stamina: 90 * game.VitalOne,
		keyStat: 1, mailStat: 1,
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
	tables := manifest.Tables{MailIdle: 1, MailAttuned: 256, BaseAttributes: paladin}
	tables.Stats.Keys, tables.Stats.Mail = int(keyStat), int(mailStat)
	for i := range ids.RuneNames {
		for sigil := 0; sigil < 2; sigil++ {
			tables.Mail = append(tables.Mail, manifest.MailItem{
				Offer: uint32(2 * (i*2 + sigil + 1)), Sigil: sigil,
				Item: "r" + string(rune('0'+(i+1)/10)) + string(rune('0'+(i+1)%10)), Name: ids.RuneItemName(i),
			})
		}
	}
	deaths := &[]string{}
	a := &app{
		session: session, fakeGame: char, lastSeen: map[string]bool{},
		man:     &manifest.Manifest{Tables: tables},
		mailbox: mailboxFor(tables),
		conn:    apc.NewConn("127.0.0.1", 1, "Slot", "", session, apc.Handler{}),
	}
	a.sendDeath = func(_ context.Context, cause string) error {
		*deaths = append(*deaths, cause)
		return nil
	}
	return a, deaths
}

func poll(a *app) { a.applyGrants(context.Background(), 0x1000) }

func rune_(name string) int64 { return ids.ItemNames()[name+" Rune"] }

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
	// A Draught drunk later bumps it; the next poll puts it back.
	char.stats[keyStat]++
	poll(a)
	if char.stats[keyStat] != 3 {
		t.Fatalf("after a Draught: %d", char.stats[keyStat])
	}
}

func TestAMissingKeyStatIsNotWrittenAndNothingBreaks(t *testing.T) {
	char := freshCharacter()
	delete(char.stats, keyStat)
	delete(char.stats, mailStat)
	a, _ := grantApp(t, char, ids.HoradricKeyItemID, rune_("El"))
	poll(a)
	if _, ok := char.stats[keyStat]; ok {
		t.Fatal("the client created a stat entry")
	}
	if a.session.Pending(rune_("El")) != 1 {
		t.Fatal("a rune was recorded as delivered with no mailbox to deliver it")
	}
}

// The whole rune delivery, as the player and the client take turns.
func TestRunesAreDeliveredOneAtATimeAndExactlyOnce(t *testing.T) {
	char := freshCharacter()
	a, _ := grantApp(t, char, rune_("El"), rune_("El"), rune_("Tir"))
	el, tir := rune_("El"), rune_("Tir")

	poll(a)
	if char.stats[mailStat] != 2 { // El, first Sigil
		t.Fatalf("first offer: %d", char.stats[mailStat])
	}
	poll(a)
	poll(a)
	if a.session.Pending(el) != 2 {
		t.Fatal("an offer that merely stands was recorded as delivered")
	}

	char.stats[mailStat]++ // the player transmutes and uses the Receipt
	poll(a)
	if a.session.Pending(el) != 1 || char.stats[mailStat] != 4 { // El again, second Sigil
		t.Fatalf("after the first Receipt: pending %d, stat %d", a.session.Pending(el), char.stats[mailStat])
	}

	char.stats[mailStat] += 256 // a Draught, mid-offer: not an acknowledgement
	poll(a)
	if a.session.Pending(el) != 1 || char.stats[mailStat] != 4 {
		t.Fatalf("a Draught was read as a Receipt: pending %d, stat %d", a.session.Pending(el), char.stats[mailStat])
	}

	char.stats[mailStat]++
	poll(a)
	if a.session.Pending(el) != 0 || char.stats[mailStat] != 10 { // Tir is r03: offers 10 and 12
		t.Fatalf("after the second Receipt: pending %d, stat %d", a.session.Pending(el), char.stats[mailStat])
	}

	char.stats[mailStat]++
	poll(a)
	if a.session.Pending(tir) != 0 || char.stats[mailStat] != 1 {
		t.Fatalf("after the last Receipt: pending %d, stat %d", a.session.Pending(tir), char.stats[mailStat])
	}
	poll(a)
	if char.stats[mailStat] != 1 {
		t.Fatal("an idle mailbox was rewritten")
	}
}

func TestARestartMidOfferNeitherLosesNorRepeatsARune(t *testing.T) {
	char := freshCharacter()
	a, _ := grantApp(t, char, rune_("El"))
	poll(a)
	char.stats[mailStat]++ // Receipt used while the client was down

	// A new client process: same session on disk, same character, no memory of the offer.
	again, _ := grantApp(t, char)
	again.session = a.session
	again.mailOffer = 0
	poll(again)
	if again.session.Pending(rune_("El")) != 0 || char.stats[mailStat] != 1 {
		t.Fatalf("pending %d, stat %d", again.session.Pending(rune_("El")), char.stats[mailStat])
	}
	poll(again)
	if again.session.AppliedTotal(rune_("El")) != 1 {
		t.Fatal("the acknowledgement was counted twice")
	}
}

func TestMailSkipRecordsALostReceipt(t *testing.T) {
	char := freshCharacter()
	a, _ := grantApp(t, char, rune_("El"), rune_("Eld"))
	poll(a)
	a.skipMail = true
	poll(a)
	if a.session.Pending(rune_("El")) != 0 {
		t.Fatal("the skipped rune is still owed")
	}
	if char.stats[mailStat] != 8 { // Eld is r02: offer 8 is for the second Sigil, now in hand
		t.Fatalf("the next rune must be offered for the other Sigil: %d", char.stats[mailStat])
	}
	a.skipMail = true
	char.stats[mailStat] = 1 // nothing on offer
	a.mailOffer = 0
	before := a.session.AppliedTotal(rune_("El"), rune_("Eld"))
	a.session.MarkApplied(rune_("Eld"), 1)
	poll(a)
	if a.session.AppliedTotal(rune_("El"), rune_("Eld")) != before+1 {
		t.Fatal("-mail-skip with nothing on offer changed something")
	}
}

func TestMailFlipOffersForTheOtherSigil(t *testing.T) {
	char := freshCharacter()
	a, _ := grantApp(t, char, rune_("El"))
	poll(a)
	if char.stats[mailStat] != 2 {
		t.Fatalf("%d", char.stats[mailStat])
	}
	a.flipMail = true
	poll(a)
	if char.stats[mailStat] != 4 {
		t.Fatalf("after -mail-flip: %d", char.stats[mailStat])
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

func TestGoldWaitsForSomewhereToPutIt(t *testing.T) {
	char := freshCharacter()
	delete(char.stats, stat.Gold)
	a, _ := grantApp(t, char, ids.GoldItemID)
	poll(a)
	if a.session.Pending(ids.GoldItemID) != 1 {
		t.Fatal("gold was recorded as handed over with no gold stat to write")
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
