//go:build windows

package main

import (
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/hectorgimenez/d2go/pkg/data/stat"
)

// pointsApp is an app that has received `sent` skill points, for a character that has
// put `spent` into its class skills.
func pointsApp(t *testing.T, sent, spent int) (*app, *fakeCharacter) {
	t.Helper()
	char := freshCharacter()
	char.skillsSpent = spent
	a, _ := grantApp(t, char)
	a.pointsReceived = sent
	a.classSkillIDs = map[int]bool{6: true, 7: true}
	return a, char
}

func pollPoints(a *app) { a.applySkillPoints(0x1000) }

func TestSkillPointsAreHeldAtSentMinusSpent(t *testing.T) {
	a, char := pointsApp(t, 5, 2)
	pollPoints(a)
	if char.writes != 0 {
		t.Fatal("the first poll only samples what was spent; it must not write")
	}
	pollPoints(a)
	if char.stats[stat.SkillPoints] != 3 {
		t.Fatalf("5 sent, 2 spent: want 3 unspent, got %d", char.stats[stat.SkillPoints])
	}
	if a.lastPointsWritten != 3 || a.balance.Unspent != 3 {
		t.Fatalf("recorded %d written, balance %+v", a.lastPointsWritten, a.balance)
	}

	// A level-up hands the player a point the multiworld did not send; the next poll
	// takes it back.
	char.stats[stat.SkillPoints]++
	pollPoints(a)
	if char.stats[stat.SkillPoints] != 3 {
		t.Fatalf("the level-up point survived: %d", char.stats[stat.SkillPoints])
	}

	// More points arrive.
	a.pointsReceived = 8
	pollPoints(a)
	if char.stats[stat.SkillPoints] != 6 {
		t.Fatalf("8 sent, 2 spent: want 6, got %d", char.stats[stat.SkillPoints])
	}
}

func TestSkillPointsWaitForSpendingToSettle(t *testing.T) {
	a, char := pointsApp(t, 5, 2)
	pollPoints(a)
	pollPoints(a)
	// A respec drops the spent total; the lower total must hold for a whole poll before
	// it refunds anything, or a half-finished rebuild would be paid twice.
	char.skillsSpent = 0
	pollPoints(a)
	if char.stats[stat.SkillPoints] != 3 {
		t.Fatalf("refunded on the first sample of a new total: %d", char.stats[stat.SkillPoints])
	}
	pollPoints(a)
	if char.stats[stat.SkillPoints] != 5 {
		t.Fatalf("settled respec: want 5, got %d", char.stats[stat.SkillPoints])
	}
}

func TestOverspentSkillPointsHoldAtZero(t *testing.T) {
	a, char := pointsApp(t, 2, 4)
	char.stats[stat.SkillPoints] = 1
	pollPoints(a)
	pollPoints(a)
	if char.stats[stat.SkillPoints] != 0 {
		t.Fatalf("overspent: want 0 unspent, got %d", char.stats[stat.SkillPoints])
	}
	if a.balance.Debt != 2 {
		t.Fatalf("want a debt of 2, got %+v", a.balance)
	}
}

func TestSkillLockTrapWithholdsPoints(t *testing.T) {
	a, char := pointsApp(t, 5, 0)
	a.skillLockUntil = time.Now().Add(time.Minute)
	pollPoints(a)
	pollPoints(a)
	if char.stats[stat.SkillPoints] != 0 {
		t.Fatalf("locked: want 0, got %d", char.stats[stat.SkillPoints])
	}
	a.skillLockUntil = time.Time{}
	pollPoints(a)
	if char.stats[stat.SkillPoints] != 5 {
		t.Fatalf("lock over: want 5, got %d", char.stats[stat.SkillPoints])
	}
}

func TestSkillPointsWaitForTheStatToExist(t *testing.T) {
	a, char := pointsApp(t, 5, 0)
	delete(char.stats, stat.SkillPoints)
	pollPoints(a)
	pollPoints(a)
	if _, ok := char.stats[stat.SkillPoints]; ok || a.lastPointsWritten != 0 {
		t.Fatal("wrote a stat the character does not have")
	}
	if a.lastAttachWarn == "" {
		t.Fatal("a missing skill-point stat must be explained, not silent")
	}
}

func TestSkillPointsNeedTheClassSkillsAndAReadableList(t *testing.T) {
	a, char := pointsApp(t, 5, 0)
	a.classSkillIDs = nil
	pollPoints(a)
	pollPoints(a)
	if char.writes != 0 {
		t.Fatal("wrote points before the manifest said which skills are the class's")
	}

	a, char = pointsApp(t, 5, 0)
	pollPoints(a)
	char.skillsErr = errors.New("skill list unreadable")
	pollPoints(a)
	if char.writes != 0 || a.pointSampleOK {
		t.Fatalf("an unreadable skill list must pause and reset the sample (writes %d)", char.writes)
	}
}

// Nothing owed and no entry: there is nothing to write, and nothing to complain about.
func TestNoPointsOwedNeedsNoPool(t *testing.T) {
	a, char := pointsApp(t, 0, 0)
	delete(char.stats, stat.SkillPoints)
	pollPoints(a)
	pollPoints(a)
	if a.needSkillPool || a.lastAttachWarn != "" {
		t.Fatalf("nothing owed: no Tonic and no warning, got need=%v warn=%q", a.needSkillPool, a.lastAttachWarn)
	}
}

// The pool spent to zero and dropped by the game, with points owed: the mailbox asks
// for a Tonic, and goes back to idle once the Tonic has recreated the entry.
func TestAnEmptiedPoolRequestsATonic(t *testing.T) {
	a, char := pointsApp(t, 5, 3)
	a.mailbox.TonicRequest = 200
	delete(char.stats, stat.SkillPoints)
	pollPoints(a)
	pollPoints(a)
	if !a.needSkillPool {
		t.Fatal("points owed and no entry: a Tonic is needed")
	}
	a.applyMail(0x1000)
	if char.stats[mailStat] != 200 {
		t.Fatalf("the mailbox should hold the Tonic request, got %d", char.stats[mailStat])
	}
	if !strings.Contains(a.lastAttachWarn, "Tonic of Renewal") {
		t.Fatalf("the player must be told to brew a Tonic: %q", a.lastAttachWarn)
	}

	// The Tonic is drunk: one point, which the client corrects to the target.
	char.stats[stat.SkillPoints] = 1
	pollPoints(a)
	if a.needSkillPool || char.stats[stat.SkillPoints] != 2 {
		t.Fatalf("after the Tonic: need=%v unspent=%d, want false and 2", a.needSkillPool, char.stats[stat.SkillPoints])
	}
	a.applyMail(0x1000)
	if char.stats[mailStat] != 1 {
		t.Fatalf("the request must be withdrawn once the pool exists, got %d", char.stats[mailStat])
	}
}

// Without the mail stat, the hint is the Draught; with a rune on offer, it is the rune.
func TestThePoolHintFollowsTheMailbox(t *testing.T) {
	a, char := pointsApp(t, 5, 0)
	delete(char.stats, mailStat)
	if h := a.poolHint(0x1000, "skill-point"); !strings.Contains(h, "Draught of Attunement") {
		t.Fatalf("no mail stat yet: %q", h)
	}
	char.stats[mailStat] = 2
	a.mailOffer = 2
	if h := a.poolHint(0x1000, "skill-point"); !strings.Contains(h, "rune waiting") {
		t.Fatalf("a rune on offer: %q", h)
	}
	a.mailOffer = 0
	if h := a.poolHint(0x1000, "skill-point"); !strings.Contains(h, "Tonic of Renewal") {
		t.Fatalf("idle mailbox: %q", h)
	}
}
