// Package grants holds the decisions about what the character should be given, kept
// free of the game process so they can be tested exhaustively.
package grants

// MailEntry is one way to deliver an item: the offer value that puts it up, and which of
// the two Sigils the recipe for that offer takes.
type MailEntry struct {
	Offer  uint32
	Sigil  int
	ItemID int64
	Name   string
}

// Mailbox is the mod's mail table.
//
// The client cannot see the Horadric Cube. It writes an OFFER into the mail stat; the
// one recipe that offer enables takes a Sigil and produces the item, the OTHER Sigil and
// a Receipt. Using the Receipt adds one to the stat. So the stat reads Offer while the
// item waits and Offer+1 once it has been collected.
//
// Every item has a separate offer for each Sigil, and the client offers under the Sigil
// the player currently holds. Once the recipe has fired the player holds the other
// Sigil, the offer on the stat no longer matches it, and it cannot fire a second time.
// Offers are even, acknowledgements odd.
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
// if it does not know (it has just started). sigil is which Sigil the player holds: it
// starts at 0 and every delivery swaps it. pending reports how many copies of an item
// are still owed.
func (m Mailbox) Step(value, current uint32, sigil int, pending func(itemID int64) int) MailStep {
	owed := func(e MailEntry) int { return pending(e.ItemID) }
	usable := func(offer uint32) bool {
		e, ok := m.byOffer(offer)
		return ok && e.Sigil == sigil && owed(e) > 0
	}

	// After a restart, the stat itself says what was going on.
	if current == 0 && value < m.Attuned {
		if usable(value) {
			current = value
		} else if value >= 3 && usable(value-1) {
			current = value - 1
		}
	}

	var delivered int64
	if current != 0 && value == current+1 {
		// Only an offer the player could have taken, for something still owed, can be
		// delivered. Anything else on the stat is stale.
		if usable(current) {
			e, _ := m.byOffer(current)
			delivered = e.ItemID
			sigil = 1 - sigil // the recipe handed back the other Sigil
		}
		current = 0
	}

	// Still waiting for the player, and the stat says so already.
	if current != 0 && value == current && usable(current) {
		return MailStep{Offer: current}
	}

	// Otherwise decide what should be on the stat: the first thing owed, under the
	// Sigil the player holds now, else idle.
	want := m.Idle
	for _, e := range m.Entries {
		n := owed(e)
		if e.ItemID == delivered {
			n--
		}
		if e.Sigil == sigil && n > 0 {
			want = e.Offer
			break
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
