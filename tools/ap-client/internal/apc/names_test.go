package apc

import "testing"

func roomNames() *nameTable {
	n := &nameTable{}
	n.addGame("D2R Randomizer", map[string]any{
		"item_name_to_id":     map[string]any{"Progressive Skill Point": float64(100)},
		"location_name_to_id": map[string]any{"Normal A1: Den of Evil": float64(5)},
	})
	n.addGame("A Link to the Past", map[string]any{"item_name_to_id": map[string]any{"Master Sword": float64(7)}})
	n.setPlayers(
		[]any{
			map[string]any{"team": float64(0), "slot": float64(1), "alias": "Etester"},
			map[string]any{"team": float64(0), "slot": float64(2), "name": "Link"},
		},
		map[string]any{"1": map[string]any{"game": "D2R Randomizer"}, "2": map[string]any{"game": "A Link to the Past"}},
		0, 1)
	return n
}

func itemSend(receiving, finder, item float64) map[string]any {
	return map[string]any{"cmd": "PrintJSON", "type": "ItemSend", "receiving": receiving,
		"item": map[string]any{"item": item, "location": float64(5), "player": finder, "flags": float64(1)}}
}

func TestItemEventsSayWhoGotWhat(t *testing.T) {
	n := roomNames()
	cases := []struct {
		packet map[string]any
		want   string
	}{
		{itemSend(1, 2, 100), "You received Progressive Skill Point from Link"},
		{itemSend(2, 1, 7), "You sent Master Sword to Link (Normal A1: Den of Evil)"},
		{itemSend(1, 1, 100), "You found your Progressive Skill Point (Normal A1: Den of Evil)"},
	}
	for _, c := range cases {
		e, ok := n.itemEvent(c.packet)
		if !ok || e.Text() != c.want {
			t.Fatalf("got %q (%v), want %q", e.Text(), ok, c.want)
		}
	}
}

func TestOtherPlayersItemsAndOtherMessagesAreNotShown(t *testing.T) {
	n := roomNames()
	if _, ok := n.itemEvent(itemSend(2, 2, 7)); ok {
		t.Fatal("an item between two other players was reported")
	}
	if _, ok := n.itemEvent(map[string]any{"cmd": "PrintJSON", "type": "Chat"}); ok {
		t.Fatal("a chat line was reported as an item")
	}
}

// An item taken with !getitem arrives as ItemCheat from slot 0.
func TestHostSentItemsAreShown(t *testing.T) {
	n := roomNames()
	p := itemSend(1, 0, 100)
	p["type"] = "ItemCheat"
	e, ok := n.itemEvent(p)
	if !ok || e.Text() != "You received Progressive Skill Point from the server" {
		t.Fatalf("got %q (%v)", e.Text(), ok)
	}
}

func TestGameMessagesForHintsGoalsChatAndJoins(t *testing.T) {
	n := roomNames()
	hint := func(receiving, finder float64, found bool) map[string]any {
		return map[string]any{"cmd": "PrintJSON", "type": "Hint", "receiving": receiving, "found": found,
			"item": map[string]any{"item": float64(100), "location": float64(5), "player": finder}}
	}
	cases := []struct {
		packet map[string]any
		kind   MessageKind
		want   string
	}{
		{itemSend(1, 2, 100), MessageItem, "You received Progressive Skill Point from Link"},
		{hint(1, 1, false), MessageHint, "Hint: your Progressive Skill Point is at your Normal A1: Den of Evil"},
		{map[string]any{"type": "Goal", "slot": float64(2)}, MessageGoal, "Link has finished!"},
		{map[string]any{"type": "Goal", "slot": float64(1)}, MessageGoal, "Goal complete!"},
		{map[string]any{"type": "Chat", "slot": float64(2), "message": "hi\nthere"}, MessageChat, "Link: hi there"},
		{map[string]any{"type": "ServerChat", "message": "restarting"}, MessageChat, "Server: restarting"},
		{map[string]any{"type": "Join", "slot": float64(2)}, MessageJoin, "Link joined"},
		{map[string]any{"type": "Part", "slot": float64(2)}, MessageJoin, "Link left"},
		{map[string]any{"type": "Countdown", "countdown": float64(3), "data": []any{map[string]any{"text": "[Server]: Starting countdown of 3"}}},
			MessageCountdown, "[Server]: Starting countdown of 3"},
	}
	for _, c := range cases {
		m, ok := n.gameMessage(c.packet)
		if !ok || m.Kind != c.kind || m.Text != c.want {
			t.Fatalf("%v: got %+v (%v), want %q", c.packet["type"], m, ok, c.want)
		}
	}
	// A hint between two other players, a found hint, our own chat echo and a tracker
	// joining are not shown.
	for _, p := range []map[string]any{
		{"type": "Hint", "receiving": float64(2), "found": false, "item": map[string]any{"item": float64(7), "location": float64(9), "player": float64(2)}},
		hint(1, 2, true),
		{"type": "Chat", "slot": float64(1), "message": "me"},
		{"type": "Join", "slot": float64(2), "tags": []any{"Tracker"}},
		{"type": "Tutorial"},
	} {
		if m, ok := n.gameMessage(p); ok {
			t.Fatalf("%v was shown: %+v", p["type"], m)
		}
	}
}

func TestHintTextFromEachSide(t *testing.T) {
	n := roomNames()
	if got := n.hintText(1, 2, 100, 9); got != "Hint: your Progressive Skill Point is at location 9 (Link)" {
		t.Fatal(got)
	}
	if got := n.hintText(2, 1, 7, 5); got != "Hint: Link wants Master Sword from your Normal A1: Den of Evil" {
		t.Fatal(got)
	}
}
