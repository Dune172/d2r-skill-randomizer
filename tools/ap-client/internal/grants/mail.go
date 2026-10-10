// Package grants holds the decisions about what the character should be given, kept
// free of the game process so they can be tested exhaustively.
package grants

// MailEntry is one deliverable: the Archipelago item and the offer value that puts it up.
type MailEntry struct {
	Offer  uint32
	ItemID int64
	Name   string
}

// Mailbox is the mod's mail table.
//
// The client cannot see the Horadric Cube. It writes an OFFER into the mail stat; the
// only recipe that offer enables produces the item together with a Receipt, and using
// the Receipt adds one to the stat. So the stat reads Offer while the item waits and
// Offer+1 once it has been collected. Offers are even, acknowledgements odd.
type Mailbox struct {
	Idle uint32
	// Attuned is what a Draught of Attunement adds. Any value at or above it means the
	// stat was just (re)created and carries no information.
	Attuned uint32
	// Entries in the order they should be offered.
	Entries []MailEntry
}

func (m Mailbox) byOffer(offer uint32) (MailEntry, bool) {
	for _, e := range m.Entries {
		if e.Offer == offer {
			return e, true
		}
	}
	return MailEntry{}, false
}

// MailStep is what to do this poll.
type MailStep struct {
	// Write is the value the mail stat should be set to, or 0 to leave it alone.
	Write uint32
	// Delivered is the item whose Receipt was just seen, or 0. The caller records it
	// only AFTER Write has succeeded: recording first and then failing to write would
	// leave the acknowledgement on the stat to be counted a second time.
	Delivered int64
	// Offer is what is on the stat once Write has been applied: an offer, or 0 for idle.
	Offer uint32
}

// Step decides the mail stat's next value.
//
// value is what the stat holds now. current is the offer the client last put up, or 0
// if it does not know (it has just started). pending reports how many copies of an item
// are still owed.
func (m Mailbox) Step(value, current uint32, pending func(itemID int64) int) MailStep {
	owed := func(e MailEntry) int { return pending(e.ItemID) }

	// After a restart, the stat itself says what was going on.
	if current == 0 && value < m.Attuned {
		if e, ok := m.byOffer(value); ok && owed(e) > 0 {
			current = value
		} else if e, ok := m.byOffer(value - 1); ok && value >= 3 && owed(e) > 0 {
			current = value - 1
		}
	}

	var delivered int64
	if current != 0 && value == current+1 {
		// Only something still owed can be delivered: an acknowledgement for an item
		// already recorded is stale, whatever the client believed was up.
		if e, ok := m.byOffer(current); ok && owed(e) > 0 {
			delivered = e.ItemID
		}
		current = 0
	}

	// Still waiting for the player, and the stat says so already.
	if current != 0 && value == current {
		return MailStep{Offer: current}
	}

	// Otherwise decide what should be on the stat: the offer already up if it is still
	// owed (the stat was reset under it), else the first thing owed, else idle.
	want := m.Idle
	if e, ok := m.byOffer(current); ok && owed(e) > 0 {
		want = current
	} else {
		for _, e := range m.Entries {
			n := owed(e)
			if e.ItemID == delivered {
				n--
			}
			if n > 0 {
				want = e.Offer
				break
			}
		}
	}

	step := MailStep{Delivered: delivered}
	if want != m.Idle {
		step.Offer = want
	}
	if value != want {
		step.Write = want
	}
	return step
}
