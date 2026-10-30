//go:build windows

package main

import (
	"fmt"
	"time"

	"github.com/Dune172/d2r-skill-randomizer/tools/ap-client/internal/game"
	"github.com/Dune172/d2r-skill-randomizer/tools/ap-client/internal/ids"
	"github.com/hectorgimenez/d2go/pkg/data/stat"
)

// recomputeDesired derives the point entitlement from the authoritative item stream.
//
// Derived from counts rather than accumulated incrementally, so duplicates, out-of-order
// delivery and full resyncs all resolve to the same answer with no reconciliation.
func (a *app) recomputeDesired() {
	counts := a.session.Counts(ids.SkillPointItemID, ids.TrainingFragmentItemID,
		ids.StatPointsItemID, ids.HoradricKeyItemID)
	got := counts[0] + counts[1]/ids.FragmentsPerPoint
	summary := fmt.Sprintf("items: %d skill point(s) received (%d fragments, %d stat point bundles, %d Horadric Keys)",
		got, counts[1], counts[2], counts[3])

	a.mu.Lock()
	changed := summary != a.itemSummary
	a.pointsReceived = got
	a.itemSummary = summary
	a.mu.Unlock()

	if changed {
		logf("%s", summary)
	}
}

// applySkillPoints holds unspent skill points at (sent by Archipelago) − (already spent).
//
// Expressed as a target rather than an increment on purpose. Points are recomputed from
// scratch every poll, so duplicate item deliveries, out-of-order arrivals and full
// resyncs all converge on the same answer with no reconciliation.
//
// It also quietly undoes the point the game grants on level-up. charstats keeps
// SkillsPerLevel at 1 so the SkillPoints STAT EXISTS to be written at all (the stat list
// is sparse; a character that never held a point has no entry), and this write is what
// reconciles any unspent level-up points. Points spent between polls cannot be undone.
func (a *app) applySkillPoints(player uintptr) {
	a.mu.Lock()
	sent := a.pointsReceived
	classIDs := a.classSkillIDs
	a.mu.Unlock()

	if len(classIDs) == 0 {
		return // no manifest yet, so "spent" cannot be computed
	}
	spent, err := a.view().SpentSkillPoints(player, classIDs)
	if err != nil {
		a.pointSampleOK = false
		a.warnAttach("point accounting paused: " + err.Error())
		return
	}
	balance, err := game.Balance(sent, spent)
	if err != nil {
		a.warnAttach(err.Error())
		return
	}
	a.balance = balance
	// A respec or partial rebuild must settle before its lower total refunds points.
	if !a.pointSampleOK || a.pointSample != spent {
		a.pointSample = spent
		a.pointSampleOK = true
		return
	}
	want := balance.Unspent
	a.mu.Lock()
	locked := time.Now().Before(a.skillLockUntil)
	a.mu.Unlock()
	if locked {
		want = 0 // a Skill Lock Trap: the points come back when it wears off
	}

	existed, err := a.view().SetUnspentSkillPoints(player, want)
	if err != nil {
		a.warnAttach("setting skill points: " + err.Error())
		return
	}
	if !existed && want == 0 {
		a.clearAttachWarning() // nothing owed, so nothing to write to yet
		return
	}
	if !existed {
		// A fresh character has no pool, and the game drops one spent to zero: create it.
		if err := a.view().GivePlayerStat(player, stat.SkillPoints, uint32(want), 0); err != nil {
			a.mu.Lock()
			a.lastPointsWritten = -1 // logged again once the points land
			a.mu.Unlock()
			a.warnAttach(waitingForRoom(fmt.Sprintf("%d skill point(s)", want), err))
			return
		}
	}
	a.clearAttachWarning()

	a.mu.Lock()
	changed := a.lastPointsWritten != want
	a.lastPointsWritten = want
	a.mu.Unlock()
	if changed {
		logf("skill points: %d unspent (%d sent, %d spent, %d excess, %d overspent)", want, sent, spent, balance.Excess, balance.Debt)
	}
	// A note, not warnAttach: clearAttachWarning above resets warnAttach's throttle on
	// every poll, so a warning here would be logged every 400 ms.
	if balance.Debt > 0 {
		a.note("debt", fmt.Sprintf("%d points were spent beyond the AP entitlement; future grants pay down that balance", balance.Debt))
	} else {
		a.note("debt", "")
	}
}
