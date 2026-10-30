package grants

import "testing"

const (
	el  = int64(100)
	eld = int64(101)
)

// Two items, each offered once per Sigil: El is 2 (Sigil 0) or 4 (Sigil 1), Eld 6 or 8.
var box = Mailbox{Idle: 1, Attuned: 256, Entries: []MailEntry{
	{Offer: 2, Sigil: 0, ItemID: el, Name: "El Rune"},
	{Offer: 4, Sigil: 1, ItemID: el, Name: "El Rune"},
	{Offer: 6, Sigil: 0, ItemID: eld, Name: "Eld Rune"},
	{Offer: 8, Sigil: 1, ItemID: eld, Name: "Eld Rune"},
}}

func owing(counts map[int64]int) func(int64) int {
	return func(id int64) int { return counts[id] }
}

func TestIdleStaysIdleWhenNothingIsOwed(t *testing.T) {
	for sigil := 0; sigil < 2; sigil++ {
		if step := box.Step(1, 0, sigil, owing(nil), false); step != (MailStep{}) {
			t.Fatalf("sigil %d: %+v", sigil, step)
		}
	}
}

func TestOffersTheFirstOwedItemUnderTheSigilThePlayerHolds(t *testing.T) {
	owed := owing(map[int64]int{eld: 1, el: 2})
	if step := box.Step(1, 0, 0, owed, false); step.Write != 2 || step.Offer != 2 {
		t.Fatalf("first Sigil: %+v", step)
	}
	if step := box.Step(1, 0, 1, owed, false); step.Write != 4 || step.Offer != 4 {
		t.Fatalf("second Sigil: %+v", step)
	}
}

func TestWaitsWithoutRewritingWhileTheOfferStands(t *testing.T) {
	step := box.Step(2, 2, 0, owing(map[int64]int{el: 1}), false)
	if step.Write != 0 || step.Offer != 2 || step.Delivered != 0 {
		t.Fatalf("%+v", step)
	}
}

func TestAReceiptDeliversAndTheNextOfferIsForTheOtherSigil(t *testing.T) {
	// Two Els and an Eld owed, first Sigil in hand; the first El's Receipt was just used.
	step := box.Step(3, 2, 0, owing(map[int64]int{el: 2, eld: 1}), false)
	if step.Delivered != el || step.Write != 4 || step.Offer != 4 {
		t.Fatalf("the second El must go up under the OTHER Sigil: %+v", step)
	}
	// Second El acknowledged, now holding the first Sigil again: the Eld under it.
	step = box.Step(5, 4, 1, owing(map[int64]int{el: 1, eld: 1}), false)
	if step.Delivered != el || step.Write != 6 || step.Offer != 6 {
		t.Fatalf("%+v", step)
	}
	// Nothing left: back to idle.
	step = box.Step(7, 6, 0, owing(map[int64]int{eld: 1}), false)
	if step.Delivered != eld || step.Write != 1 || step.Offer != 0 {
		t.Fatalf("%+v", step)
	}
}

// The flaw this design exists to close: after a transmute the player holds the other
// Sigil. Whatever the client writes next, the offer that just fired must never be the
// one on the stat while the player could use it again.
func TestAnOfferIsNeverLeftUpForTheSigilItReturned(t *testing.T) {
	for _, counts := range []map[int64]int{{el: 1}, {el: 5}, {el: 2, eld: 3}} {
		for _, e := range box.Entries {
			if counts[e.ItemID] == 0 {
				continue
			}
			// The offer stands and the player has NOT used the Receipt yet. They now
			// hold the other Sigil; the stat still shows e.Offer, which only the
			// Sigil they no longer hold can use.
			waiting := box.Step(e.Offer, e.Offer, e.Sigil, owing(counts), false)
			if waiting.Write != 0 {
				t.Fatalf("offer %d was rewritten while waiting: %+v", e.Offer, waiting)
			}
			// After the Receipt, the next offer must be for the other Sigil.
			after := box.Step(e.Offer+1, e.Offer, e.Sigil, owing(counts), false)
			if after.Offer != 0 {
				next, _ := box.byOffer(after.Offer)
				if next.Sigil == e.Sigil {
					t.Fatalf("after delivering under Sigil %d the next offer %d is for the same Sigil", e.Sigil, after.Offer)
				}
			}
		}
	}
}

// A delivery must never be counted without the stat moving off the acknowledgement, or
// the next poll would count it again; and nothing unowed is ever offered or delivered.
func TestEveryStepIsConsistent(t *testing.T) {
	for value := uint32(0); value < 270; value++ {
		for _, current := range []uint32{0, 2, 4, 6, 8} {
			for sigil := 0; sigil < 2; sigil++ {
				for _, counts := range []map[int64]int{nil, {el: 1}, {eld: 1}, {el: 3, eld: 2}} {
					step := box.Step(value, current, sigil, owing(counts), false)
					if step.Delivered != 0 && step.Write == 0 {
						t.Fatalf("value %d current %d sigil %d %v: delivered without a write: %+v", value, current, sigil, counts, step)
					}
					if step.Delivered != 0 && counts[step.Delivered] == 0 {
						t.Fatalf("value %d current %d sigil %d %v: delivered something not owed", value, current, sigil, counts)
					}
					if step.Write != 0 && step.Write != box.Idle {
						if e, ok := box.byOffer(step.Write); !ok || counts[e.ItemID] == 0 {
							t.Fatalf("value %d current %d sigil %d %v: offered %d, which is not owed", value, current, sigil, counts, step.Write)
						}
					}
				}
			}
		}
	}
}

func TestRestartRecoversAStandingOffer(t *testing.T) {
	step := box.Step(6, 0, 0, owing(map[int64]int{el: 1, eld: 1}), false)
	if step.Write != 0 || step.Offer != 6 || step.Delivered != 0 {
		t.Fatalf("the Eld was already up and must stay up: %+v", step)
	}
}

func TestRestartRecoversAnAcknowledgementMadeWhileAway(t *testing.T) {
	// The stat reads "Eld acknowledged, taken with the first Sigil"; the client restarts
	// still believing the first Sigil is in hand, because the delivery is not recorded.
	step := box.Step(7, 0, 0, owing(map[int64]int{el: 1, eld: 1}), false)
	if step.Delivered != eld || step.Write != 4 || step.Offer != 4 {
		t.Fatalf("the El must follow under the other Sigil: %+v", step)
	}
}

func TestRestartIgnoresAStaleAcknowledgement(t *testing.T) {
	// "Eld acknowledged" is still on the stat but no Eld is owed: it was recorded before
	// the restart. It must not deliver a second one.
	step := box.Step(7, 0, 1, owing(map[int64]int{el: 1}), false)
	if step.Delivered != 0 || step.Write != 4 {
		t.Fatalf("%+v", step)
	}
}

func TestADraughtNeverCountsAsAReceipt(t *testing.T) {
	// A Draught drunk while the El is up adds 256, landing nowhere near offer+1.
	step := box.Step(2+256, 2, 0, owing(map[int64]int{el: 1}), false)
	if step.Delivered != 0 || step.Write != 2 || step.Offer != 2 {
		t.Fatalf("%+v", step)
	}
	// The first Draught on a fresh character: 0 + 256, nothing owed.
	step = box.Step(256, 0, 0, owing(nil), false)
	if step.Delivered != 0 || step.Write != 1 || step.Offer != 0 {
		t.Fatalf("%+v", step)
	}
}

func TestAStatResetUnderAnOfferIsPutBack(t *testing.T) {
	step := box.Step(1, 6, 0, owing(map[int64]int{eld: 1}), false)
	if step.Write != 6 || step.Offer != 6 || step.Delivered != 0 {
		t.Fatalf("%+v", step)
	}
}

func TestAnOfferForTheWrongSigilIsReplaced(t *testing.T) {
	// The stat holds the El's offer for the first Sigil, but the player holds the second
	// (the client's count was corrected). The offer is swapped for the right one.
	step := box.Step(2, 2, 1, owing(map[int64]int{el: 1}), false)
	if step.Write != 4 || step.Offer != 4 || step.Delivered != 0 {
		t.Fatalf("%+v", step)
	}
}

// The same box with a Tonic request value, as current mods have.
func tonicBox() Mailbox {
	b := box
	b.TonicRequest = 200
	return b
}

func TestATonicIsRequestedOnlyWhenWanted(t *testing.T) {
	b := tonicBox()
	if step := b.Step(1, 0, 0, owing(nil), true); step.Write != 200 || !step.Tonic || step.Offer != 0 {
		t.Fatalf("idle with a pool missing: %+v, want the Tonic request", step)
	}
	if step := b.Step(200, 0, 0, owing(nil), true); step.Write != 0 || !step.Tonic {
		t.Fatalf("a standing request must be left alone: %+v", step)
	}
	if step := b.Step(200, 0, 0, owing(nil), false); step.Write != 1 || step.Tonic {
		t.Fatalf("a request nobody wants must go back to idle: %+v", step)
	}
}

func TestATonicGoesAheadOfTheNextRune(t *testing.T) {
	b := tonicBox()
	if step := b.Step(1, 0, 0, owing(map[int64]int{el: 1}), true); step.Write != 200 || !step.Tonic {
		t.Fatalf("a missing pool must come before an owed rune: %+v", step)
	}
	// Once the pool exists again the rune is offered.
	if step := b.Step(200, 0, 0, owing(map[int64]int{el: 1}), false); step.Write != 2 || step.Offer != 2 {
		t.Fatalf("after the Tonic the rune is offered: %+v", step)
	}
}

func TestATonicNeverReplacesARuneBeingCollected(t *testing.T) {
	b := tonicBox()
	owed := owing(map[int64]int{el: 1})
	if step := b.Step(2, 2, 0, owed, true); step.Write != 0 || step.Offer != 2 || step.Tonic {
		t.Fatalf("a standing rune offer must stay up: %+v", step)
	}
	// The Receipt is used: the rune is recorded, then the Tonic is requested.
	step := b.Step(3, 2, 0, owed, true)
	if step.Delivered != el || step.Write != 200 || !step.Tonic {
		t.Fatalf("after a delivery the Tonic is requested: %+v", step)
	}
}

func TestModsWithoutATonicIgnoreTheRequest(t *testing.T) {
	if step := box.Step(1, 0, 0, owing(map[int64]int{el: 1}), true); step.Write != 2 || step.Tonic {
		t.Fatalf("no Tonic request value: offer the rune as before, got %+v", step)
	}
	if step := box.Step(1, 0, 0, owing(nil), true); step != (MailStep{}) {
		t.Fatalf("no Tonic request value and nothing owed: stay idle, got %+v", step)
	}
}
