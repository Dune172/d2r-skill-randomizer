package grants

import "testing"

const (
	el  = int64(100)
	eld = int64(101)
)

var box = Mailbox{Idle: 1, Attuned: 128, Entries: []MailEntry{
	{Offer: 2, ItemID: el, Name: "El Rune"},
	{Offer: 4, ItemID: eld, Name: "Eld Rune"},
}}

func owing(counts map[int64]int) func(int64) int {
	return func(id int64) int { return counts[id] }
}

func TestIdleStaysIdleWhenNothingIsOwed(t *testing.T) {
	step := box.Step(1, 0, owing(nil))
	if step != (MailStep{}) {
		t.Fatalf("%+v", step)
	}
}

func TestOffersTheFirstOwedItem(t *testing.T) {
	step := box.Step(1, 0, owing(map[int64]int{eld: 1, el: 2}))
	if step.Write != 2 || step.Offer != 2 || step.Delivered != 0 {
		t.Fatalf("%+v", step)
	}
}

func TestWaitsWithoutRewritingWhileTheOfferStands(t *testing.T) {
	step := box.Step(2, 2, owing(map[int64]int{el: 1}))
	if step.Write != 0 || step.Offer != 2 || step.Delivered != 0 {
		t.Fatalf("%+v", step)
	}
}

func TestReceiptDeliversAndMovesOn(t *testing.T) {
	// Two Els and an Eld owed; the first El's Receipt has just been used.
	step := box.Step(3, 2, owing(map[int64]int{el: 2, eld: 1}))
	if step.Delivered != el || step.Write != 2 || step.Offer != 2 {
		t.Fatalf("second El should go up next: %+v", step)
	}
	// Last El acknowledged: the Eld is next.
	step = box.Step(3, 2, owing(map[int64]int{el: 1, eld: 1}))
	if step.Delivered != el || step.Write != 4 || step.Offer != 4 {
		t.Fatalf("%+v", step)
	}
	// Nothing left: back to idle.
	step = box.Step(5, 4, owing(map[int64]int{eld: 1}))
	if step.Delivered != eld || step.Write != 1 || step.Offer != 0 {
		t.Fatalf("%+v", step)
	}
}

// A delivery must never be counted without the stat moving off the acknowledgement, or
// the next poll would count it again.
func TestEveryDeliveryComesWithAWrite(t *testing.T) {
	for value := uint32(0); value < 140; value++ {
		for _, current := range []uint32{0, 2, 4} {
			for _, counts := range []map[int64]int{nil, {el: 1}, {eld: 1}, {el: 3, eld: 2}} {
				step := box.Step(value, current, owing(counts))
				if step.Delivered != 0 && step.Write == 0 {
					t.Fatalf("value %d current %d %v: delivered without a write: %+v", value, current, counts, step)
				}
				if step.Delivered != 0 && counts[step.Delivered] == 0 {
					t.Fatalf("value %d current %d %v: delivered something not owed", value, current, counts)
				}
				if step.Write != 0 && step.Write != box.Idle {
					if e, ok := box.byOffer(step.Write); !ok || counts[e.ItemID] == 0 {
						t.Fatalf("value %d current %d %v: offered %d, which is not owed", value, current, counts, step.Write)
					}
				}
			}
		}
	}
}

func TestRestartRecoversAStandingOffer(t *testing.T) {
	step := box.Step(4, 0, owing(map[int64]int{el: 1, eld: 1}))
	if step.Write != 0 || step.Offer != 4 || step.Delivered != 0 {
		t.Fatalf("the Eld was already up and must stay up: %+v", step)
	}
}

func TestRestartRecoversAnAcknowledgementMadeWhileAway(t *testing.T) {
	step := box.Step(5, 0, owing(map[int64]int{el: 1, eld: 1}))
	if step.Delivered != eld || step.Write != 2 || step.Offer != 2 {
		t.Fatalf("%+v", step)
	}
}

func TestRestartIgnoresAStaleAcknowledgement(t *testing.T) {
	// The stat still reads "Eld acknowledged" but no Eld is owed any more: it was
	// recorded before the restart. It must not deliver a second one.
	step := box.Step(5, 0, owing(map[int64]int{el: 1}))
	if step.Delivered != 0 || step.Write != 2 {
		t.Fatalf("%+v", step)
	}
}

func TestADraughtNeverCountsAsAReceipt(t *testing.T) {
	// A Draught drunk while the El is up adds 128, landing nowhere near offer+1.
	step := box.Step(2+128, 2, owing(map[int64]int{el: 1}))
	if step.Delivered != 0 || step.Write != 2 || step.Offer != 2 {
		t.Fatalf("%+v", step)
	}
	// The first Draught on a fresh character: 0 + 128, nothing owed.
	step = box.Step(128, 0, owing(nil))
	if step.Delivered != 0 || step.Write != 1 || step.Offer != 0 {
		t.Fatalf("%+v", step)
	}
}

func TestAStatResetUnderAnOfferIsPutBack(t *testing.T) {
	step := box.Step(1, 4, owing(map[int64]int{el: 1, eld: 1}))
	if step.Write != 4 || step.Offer != 4 || step.Delivered != 0 {
		t.Fatalf("%+v", step)
	}
}

func TestAnOfferNoLongerOwedIsWithdrawn(t *testing.T) {
	step := box.Step(4, 4, owing(map[int64]int{el: 1}))
	// The stat matches the believed offer, so the client keeps waiting this poll...
	if step.Write != 0 || step.Offer != 4 {
		t.Fatalf("%+v", step)
	}
	// ...but a restart re-reads the stat and replaces an offer nothing backs.
	step = box.Step(4, 0, owing(map[int64]int{el: 1}))
	if step.Write != 2 || step.Offer != 2 {
		t.Fatalf("%+v", step)
	}
}
