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
