//go:build windows

package main

import (
	"context"
	"fmt"
	"time"

	"github.com/Dune172/d2r-skill-randomizer/tools/ap-client/internal/game"
	"github.com/Dune172/d2r-skill-randomizer/tools/ap-client/internal/grants"
	"github.com/Dune172/d2r-skill-randomizer/tools/ap-client/internal/ids"
	"github.com/Dune172/d2r-skill-randomizer/tools/ap-client/internal/manifest"
	"github.com/hectorgimenez/d2go/pkg/data/stat"
)

const (
	// How long a Skill Lock Trap withholds unspent skill points.
	skillLockDuration = time.Minute
	// How long to wait for the game to register a DeathLink kill before concluding it
	// does not honour the write.
	killGrace = 3 * time.Second
)

// gameView is the part of the running game the grant and skill-point code reads and
// writes. The real one is *game.Client; tests substitute a character made of a map.
type gameView interface {
	SpentSkillPoints(player uintptr, classSkillIDs map[int]bool) (int, error)
	SetUnspentSkillPoints(player uintptr, n int) (bool, error)
	BaseStat(unit uintptr, id stat.ID) (uint32, bool, error)
	SetPlayerStat(player uintptr, id stat.ID, value uint32) (bool, error)
	SpentStatPoints(player uintptr, classBase int) (int, error)
	Apply(player uintptr, effect game.TrapEffect) (bool, error)
	IsDead(player uintptr) (bool, error)
	Progress() (game.Progress, bool)
}

func (a *app) view() gameView {
	if a.fakeGame != nil {
		return a.fakeGame
	}
	return a.gc
}

// applyGrants gives the character everything beyond skill points: pooled stat points,
// Horadric Keys, runes through the mailbox, gold, traps, and DeathLink.
//
// Every one of these is a change to the value of a stat the game already holds. Targets
// (stat points, keys) are recomputed from the item counts each poll, so they converge
// however the items arrived. One-shot effects (gold, traps, runes) are owed until
// recorded as applied, and are recorded only after the write has succeeded.
func (a *app) applyGrants(ctx context.Context, player uintptr) {
	a.mu.Lock()
	man := a.man
	pooled := a.statPointsPooled
	a.mu.Unlock()
	if man == nil {
		return
	}

	if pooled {
		a.applyStatPoints(player, man.Tables.BaseAttributes)
	}
	a.applyKeys(player, stat.ID(man.Tables.Stats.Keys))
	a.applyMail(player)

	prog, ok := a.view().Progress()
	if !ok {
		return
	}
	dead, err := a.view().IsDead(player)
	if err != nil {
		return
	}
	a.reportDeath(ctx, dead)
	if dead {
		a.deathLanded()
		return // nothing below should land on a corpse
	}
	a.applyGold(player, prog.CharLevel)
	if game.IsTown(prog.AreaLevelID) {
		return // traps and incoming deaths wait until the character can actually be hurt
	}
	a.applyIncomingDeath(player)
	a.applyTraps(player)
}

// applyStatPoints holds unspent attribute points at (sent by Archipelago) - (spent).
func (a *app) applyStatPoints(player uintptr, classBase int) {
	sent := a.session.Count(ids.StatPointsItemID) * ids.StatPointsPerItem
	spent, err := a.view().SpentStatPoints(player, classBase)
	if err != nil {
		a.note("stat", "stat point accounting paused: "+err.Error())
		return
	}
	want := sent - spent
	if want < 0 {
		want = 0
	}
	existed, err := a.view().SetPlayerStat(player, stat.StatPoints, uint32(want))
	a.mu.Lock()
	a.needStatPool = err == nil && !existed && want > 0 // asks the mailbox for a Tonic
	a.mu.Unlock()
	switch {
	case err != nil:
		a.note("stat", "setting stat points: "+err.Error())
	case !existed && want == 0:
		a.note("stat", "") // nothing owed, so nothing to write to yet
	case !existed:
		a.note("stat", a.poolHint(player, "stat-point"))
	default:
		a.note("stat", fmt.Sprintf("stat points: %d unspent (%d sent, %d spent)", want, sent, spent))
	}
}

// applyKeys holds the key stat at the number of Horadric Keys received, plus one.
func (a *app) applyKeys(player uintptr, keyStat stat.ID) {
	keys := a.session.Count(ids.HoradricKeyItemID)
	a.mu.Lock()
	keyItems := a.keyItems // set by applySlotData on the connection's goroutine
	a.mu.Unlock()
	if keys == 0 && !keyItems {
		return
	}
	existed, err := a.view().SetPlayerStat(player, keyStat, uint32(keys+1))
	switch {
	case err != nil:
		a.note("keys", "setting Horadric Keys: "+err.Error())
	case !existed:
		a.note("keys", attuneHint("your Horadric Keys"))
	default:
		a.note("keys", fmt.Sprintf("Horadric Keys: %d held (the Horadric Staff needs %d, Khalim's Will %d)",
			keys, ids.KeysForHoradricStaff, ids.KeysForKhalimsWill))
	}
}

// poolHint says how to get an entry back for an emptied point pool: from whether the
// mail stat exists now, and whether a rune was on offer at the last poll.
func (a *app) poolHint(player uintptr, what string) string {
	a.mu.Lock()
	offer, man := a.mailOffer, a.man
	a.mu.Unlock()
	mailExists := false
	if man != nil {
		_, mailExists, _ = a.view().BaseStat(player, stat.ID(man.Tables.Stats.Mail))
	}
	switch {
	case !mailExists:
		return "waiting for the game to create the " + what + " stat: right-click the Draught of Attunement in " +
			"your inventory (if it is gone, transmute the Archipelago Sigil alone in the Horadric Cube for another)"
	case offer != 0:
		return "waiting for the " + what + " stat: collect the rune waiting in the mailbox first (the Archipelago " +
			"Sigil alone in the Horadric Cube, then right-click the Receipt); a Tonic of Renewal comes next"
	default:
		return "waiting for the " + what + " stat: put the Archipelago Sigil alone in the Horadric Cube, transmute, " +
			"and right-click the Tonic of Renewal it makes"
	}
}

func attuneHint(what string) string {
	return "cannot deliver " + what + " yet: right-click the Draught of Attunement in your inventory " +
		"(transmute the Archipelago Sigil alone in the Horadric Cube for another)"
}

// applyMail runs the rune mailbox: put up the next rune that is owed, and record a rune
// as delivered when its Receipt has been used.
func (a *app) applyMail(player uintptr) {
	a.mu.Lock()
	box := a.mailbox
	current := a.mailOffer
	a.mu.Unlock()
	if len(box.Entries) == 0 {
		return
	}
	// Every rune appears twice in the table, once per Sigil.
	runes := make([]int64, len(ids.RuneNames))
	owed := 0
	for i := range runes {
		runes[i] = ids.RuneIDBase + int64(i)
		owed += a.session.Pending(runes[i])
	}
	a.mu.Lock()
	flip := a.flipMail
	a.flipMail = false
	a.mu.Unlock()
	if flip {
		if err := a.session.FlipMail(); err != nil {
			logf("recording -mail-flip failed: %v", err)
		} else {
			logf("mailbox: now offering runes for the other Archipelago Sigil")
		}
	}
	sigil := a.session.MailSigil(runes...)

	mailStat := stat.ID(a.man.Tables.Stats.Mail)
	value, exists, err := a.view().BaseStat(player, mailStat)
	if err != nil {
		return
	}
	a.mu.Lock()
	wantTonic := a.needSkillPool || a.needStatPool
	a.mu.Unlock()
	if !exists {
		if owed > 0 {
			a.note("mail", attuneHint(fmt.Sprintf("%d waiting rune(s)", owed)))
		}
		return
	}

	// -mail-skip: the Receipt for the rune on offer is gone, so nothing will ever
	// acknowledge it. Record it as collected; the Sigil was swapped when it was taken.
	a.mu.Lock()
	skip := a.skipMail
	a.skipMail = false
	a.mu.Unlock()
	if skip {
		offered := current
		if offered == 0 {
			offered = value
		}
		skipped := false
		for _, e := range box.Entries {
			if e.Offer == offered && e.Sigil == sigil && a.session.Pending(e.ItemID) > 0 {
				if err := a.session.MarkApplied(e.ItemID, 1); err == nil {
					logf("mailbox: %s recorded as collected (-mail-skip)", e.Name)
					current, sigil, skipped = 0, 1-sigil, true
				}
			}
		}
		if !skipped {
			logf("mailbox: -mail-skip found no rune on offer; nothing was changed")
		}
	}

	step := box.Step(value, current, sigil, a.session.Pending, wantTonic)
	if step.Write != 0 {
		if _, err := a.view().SetPlayerStat(player, mailStat, step.Write); err != nil {
			a.note("mail", "updating the mailbox: "+err.Error())
			return
		}
	}
	// Recorded only now that the stat has moved off the acknowledgement.
	if step.Delivered != 0 {
		if err := a.session.MarkApplied(step.Delivered, 1); err != nil {
			logf("recording a delivered rune failed: %v", err)
		}
		logf("mailbox: %s collected", ids.RuneItemName(int(step.Delivered-ids.RuneIDBase)))
	}
	a.mu.Lock()
	a.mailOffer = step.Offer
	a.mu.Unlock()

	if step.Tonic {
		// The point code's own warning says what to do; nothing more to add here.
		a.note("mail", "")
		return
	}
	if step.Offer == 0 {
		a.note("mail", "")
		return
	}
	for _, e := range box.Entries {
		if e.Offer == step.Offer {
			a.note("mail", fmt.Sprintf("mailbox: %s is waiting (%d rune(s) owed). Put the Archipelago Sigil alone in "+
				"the Horadric Cube and transmute, then right-click the Archipelago Receipt. "+
				"(Cube refuses: restart with -mail-flip. Receipt lost: restart with -mail-skip.)", e.Name, owed))
		}
	}
}

// applyGold hands over owed Gold items, one a poll.
func (a *app) applyGold(player uintptr, level int) {
	if a.session.Pending(ids.GoldItemID) == 0 {
		return
	}
	current, exists, err := a.view().BaseStat(player, stat.Gold)
	if err != nil {
		return
	}
	if !exists {
		a.note("gold", "gold is waiting: pick up any gold so the game has somewhere to put it")
		return
	}
	next := game.GoldAfter(current, level)
	if _, err := a.view().SetPlayerStat(player, stat.Gold, next); err != nil {
		return
	}
	if err := a.session.MarkApplied(ids.GoldItemID, 1); err == nil {
		logf("gold: +%d", next-current)
		a.note("gold", "")
	}
}

// applyTraps springs one owed trap a poll.
func (a *app) applyTraps(player uintptr) {
	for index, name := range ids.Traps {
		id := ids.TrapIDBase + int64(index)
		if a.session.Pending(id) == 0 {
			continue
		}
		if ids.Trap(index) == ids.TrapSkillLock {
			a.mu.Lock()
			a.skillLockUntil = time.Now().Add(skillLockDuration)
			a.mu.Unlock()
		} else {
			effect := map[ids.Trap]game.TrapEffect{
				ids.TrapManaBurn:       game.ManaBurn,
				ids.TrapExhaustion:     game.Exhaustion,
				ids.TrapBrushWithDeath: game.BrushWithDeath,
				ids.TrapGoldTax:        game.GoldTax,
			}[ids.Trap(index)]
			if _, err := a.view().Apply(player, effect); err != nil {
				return // try again next poll
			}
		}
		if err := a.session.MarkApplied(id, 1); err == nil {
			logf("TRAP: %s", name)
		}
		return
	}
}

// reportDeath tells the room when the character dies, once per death.
func (a *app) reportDeath(ctx context.Context, dead bool) {
	a.mu.Lock()
	wasDead := a.wasDead
	a.wasDead = dead
	enabled := a.deathLink
	ours := a.killedByLink
	if !dead {
		a.killedByLink = false
	}
	a.mu.Unlock()
	if !enabled || !dead || wasDead || ours {
		return
	}
	cause := fmt.Sprintf("%s died in Sanctuary", a.conn.Slot)
	send := a.conn.SendDeath
	if a.sendDeath != nil {
		send = a.sendDeath
	}
	if err := send(ctx, cause); err != nil {
		logf("DeathLink: could not send the death (%v)", err)
		return
	}
	logf("DeathLink: sent your death to the room")
}

// applyIncomingDeath carries out a death that arrived from another player.
//
// Whether writing life to nothing actually kills a character has not been confirmed in
// the game. So the write is checked: if the character is still alive after a few
// seconds, the death is downgraded to a Brush with Death and the client says so once,
// rather than writing zero forever.
func (a *app) applyIncomingDeath(player uintptr) {
	a.mu.Lock()
	pending := a.pendingDeaths
	since := a.killStarted
	unsupported := a.killUnsupported
	a.mu.Unlock()
	if pending == 0 {
		return
	}

	if unsupported {
		if _, err := a.view().Apply(player, game.BrushWithDeath); err == nil {
			a.finishDeath("DeathLink: applied as a Brush with Death")
		}
		return
	}
	if since.IsZero() {
		if _, err := a.view().Apply(player, game.Kill); err != nil {
			return
		}
		a.mu.Lock()
		a.killStarted = time.Now()
		a.killedByLink = true
		a.mu.Unlock()
		return
	}
	// Still alive (applyGrants returns before here once the character is dead).
	if time.Since(since) > killGrace {
		a.mu.Lock()
		a.killUnsupported = true
		a.killedByLink = false
		a.mu.Unlock()
		logf("DeathLink: the game did not treat an emptied life pool as a death.")
		logf("  Incoming deaths will leave you on one life instead.")
	}
}

func (a *app) finishDeath(message string) {
	a.mu.Lock()
	if a.pendingDeaths > 0 {
		a.pendingDeaths--
	}
	a.killStarted = time.Time{}
	a.mu.Unlock()
	logf("%s", message)
}

// deathLanded is called when the character is seen dead: a death in flight has arrived.
func (a *app) deathLanded() {
	a.mu.Lock()
	inFlight := !a.killStarted.IsZero()
	a.mu.Unlock()
	if inFlight {
		a.finishDeath("DeathLink: you died with the room")
	}
}

// note logs a line about one topic only when it changes, so a standing condition is
// stated once rather than every poll.
func (a *app) note(topic, message string) {
	a.mu.Lock()
	if a.notes == nil {
		a.notes = map[string]string{}
	}
	same := a.notes[topic] == message
	a.notes[topic] = message
	a.mu.Unlock()
	if !same && message != "" {
		logf("%s", message)
	}
}

// mailboxFor builds the mail table from the manifest, in rune order.
func mailboxFor(tables manifest.Tables) grants.Mailbox {
	box := grants.Mailbox{Idle: tables.MailIdle, Attuned: tables.MailAttuned, TonicRequest: tables.TonicRequest}
	codes := map[string]int{}
	for i := range ids.RuneNames {
		codes[fmt.Sprintf("r%02d", i+1)] = i
	}
	for _, m := range tables.Mail {
		if index, ok := codes[m.Item]; ok {
			box.Entries = append(box.Entries, grants.MailEntry{
				Offer: m.Offer, Sigil: m.Sigil, ItemID: ids.RuneIDBase + int64(index), Name: m.Name,
			})
		}
	}
	return box
}
