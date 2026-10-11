package manifest

import (
	"encoding/json"
	"fmt"
	"testing"
)

func valid(t *testing.T) map[string]any {
	t.Helper()
	slots := []Slot{}
	for i := 0; i < 30; i++ {
		slots = append(slots, Slot{SlotID: fmt.Sprintf("pal:S%02d", i), SkillID: i + 100, SkillName: fmt.Sprintf("Skill%d", i)})
	}
	return map[string]any{"contractVersion": ContractVersion, "pipelineVersion": 1, "seed": 1234, "modName": "seed1234", "savepath": "ap_1234_pal", "characterClass": "pal", "classes": map[string]any{"pal": map[string]any{"slots": slots}}, "tables": map[string]any{"stats": map[string]any{"keys": 368, "mail": 369}, "mailIdle": 1, "mailAttuned": 256, "baseAttributes": 85, "mail": []map[string]any{{"offer": 2, "item": "r01", "name": "El Rune"}}}}
}
func TestManifestRejectsInvalidIdentity(t *testing.T) {
	for key, v := range map[string]any{"modName": "../outside", "savepath": "../../saves", "seed": 0, "characterClass": "xxx", "contractVersion": 1} {
		input := valid(t)
		input[key] = v
		raw, _ := json.Marshal(input)
		if _, e := Parse(raw); e == nil {
			t.Fatalf("accepted %s", key)
		}
	}
}
func TestManifestRequiresUniqueSkillRowsAndCompleteSlots(t *testing.T) {
	for _, mode := range []string{"duplicate-row", "missing-slot", "duplicate-name"} {
		input := valid(t)
		class := input["classes"].(map[string]any)["pal"].(map[string]any)
		slots := class["slots"].([]Slot)
		switch mode {
		case "duplicate-row":
			slots[1].SkillID = slots[0].SkillID
		case "missing-slot":
			slots[1].SlotID = "pal:S00"
		case "duplicate-name":
			slots[1].SkillName = slots[0].SkillName
		}
		raw, _ := json.Marshal(input)
		if _, e := Parse(raw); e == nil {
			t.Fatal("accepted", mode)
		}
	}
}
func TestLocalManifestMustMatchRoom(t *testing.T) {
	raw, _ := json.Marshal(valid(t))
	m, e := Parse(raw)
	if e != nil {
		t.Fatal(e)
	}
	if e = m.MatchRoom(1234, "pal", "ap_1234_pal"); e != nil {
		t.Fatal(e)
	}
	if e = m.MatchRoom(4321, "pal", "ap_1234_pal"); e == nil {
		t.Fatal("accepted different room seed")
	}
}
