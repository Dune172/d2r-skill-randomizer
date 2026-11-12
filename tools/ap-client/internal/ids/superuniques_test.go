package ids

import (
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

// readTable reads one of the repo's extracted game tables as rows keyed by column name.
func readTable(t *testing.T, name string) []map[string]string {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("..", "..", "..", "..", "data", "txt", name))
	if err != nil {
		t.Skipf("game data not available: %v", err)
	}
	lines := strings.Split(strings.ReplaceAll(string(data), "\r\n", "\n"), "\n")
	header := strings.Split(lines[0], "\t")
	var rows []map[string]string
	for _, line := range lines[1:] {
		if line == "" {
			continue
		}
		cells := strings.Split(line, "\t")
		row := map[string]string{}
		for i, h := range header {
			if i < len(cells) {
				row[h] = cells[i]
			}
		}
		rows = append(rows, row)
	}
	return rows
}

// Every super-unique must be a real one, recognised by its class's monstats row, and
// live in areas of its own act: a wrong row or area is a check that never fires.
func TestSuperUniquesMatchTheGameData(t *testing.T) {
	supers := map[string]bool{}
	for _, r := range readTable(t, "superuniques.txt") {
		supers[r["Class"]] = true
	}
	rowOf := map[string]string{}
	for _, r := range readTable(t, "monstats.txt") {
		rowOf[r["Id"]] = r["*hcIdx"]
	}
	actOf := map[int]int{}
	for _, r := range readTable(t, "levels.txt") {
		id, errID := strconv.Atoi(r["Id"])
		act, errAct := strconv.Atoi(r["Act"])
		if errID == nil && errAct == nil {
			actOf[id] = act
		}
	}
	names := map[string]bool{}
	for _, su := range SuperUniques {
		if names[su.Name] {
			t.Errorf("%s is listed twice", su.Name)
		}
		names[su.Name] = true
		if !supers[su.Class] {
			t.Errorf("%s: class %q is not in superuniques.txt", su.Name, su.Class)
		}
		if got := rowOf[su.Class]; got != strconv.Itoa(int(su.Txt)) {
			t.Errorf("%s: monstats row of %s is %s, the table says %d", su.Name, su.Class, got, su.Txt)
		}
		for _, area := range su.Areas {
			act, ok := actOf[area]
			if !ok || act != su.Act {
				t.Errorf("%s: area %d is in act %d (found %v), the table says %d", su.Name, area, act, ok, su.Act)
			}
		}
	}
	// No two entries may claim the same class in the same area.
	for i, a := range SuperUniques {
		for _, area := range a.Areas {
			if j, _ := SuperUniqueFor(a.Txt, area); j != i {
				t.Errorf("%s in area %d resolves to entry %d", a.Name, area, j)
			}
		}
	}
	if _, ok := SuperUniqueFor(58, 1); ok {
		t.Error("a Fallen Shaman in the Rogue Encampment was taken for Bishibosh")
	}
}
