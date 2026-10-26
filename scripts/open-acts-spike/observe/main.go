// observe: read-only snapshot of an offline D2R game for the Open Acts spike.
//
// Built inside a copy of tools/ap-client (archipelago branch) so it reuses the vendored,
// patched d2go. Prints one JSON object: area, player position, open menus, nearby
// monsters/objects/ground items with a screen offset from the player, and the carried
// items. It never writes memory.
//
//	observe [-radius 40] [-w 1280 -h 720]
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"math"
	"os"
	"sort"
	"time"

	"github.com/hectorgimenez/d2go/pkg/data"
	"github.com/hectorgimenez/d2go/pkg/data/item"
	"github.com/hectorgimenez/d2go/pkg/data/stat"
	"github.com/hectorgimenez/d2go/pkg/memory"
)

type thing struct {
	Kind  string  `json:"kind"`
	Name  string  `json:"name"`
	ID    int     `json:"id,omitempty"`
	X     int     `json:"x"`
	Y     int     `json:"y"`
	Dist  float64 `json:"dist"`
	SX    int     `json:"sx"` // screen position in a w×h client area, player at the centre
	SY    int     `json:"sy"`
	Mode  string  `json:"mode,omitempty"`
	Sel   bool    `json:"sel,omitempty"`
	Life  int     `json:"life,omitempty"`
	Where string  `json:"where,omitempty"`
	Hover bool    `json:"hover,omitempty"`
}

type snapshot struct {
	InGame  bool     `json:"inGame"`
	Name    string   `json:"name"`
	Area    string   `json:"area"`
	AreaID  int      `json:"areaId"`
	X       int      `json:"x"`
	Y       int      `json:"y"`
	Life    int      `json:"life"`
	Level   int      `json:"level"`
	Menus   any      `json:"menus"`
	WPs     []string `json:"waypointsOnTab,omitempty"`
	Near    []thing  `json:"near"`
	Carried []thing  `json:"carried"`
	Quests  any      `json:"quests,omitempty"`
}

func main() {
	radius := flag.Float64("radius", 40, "only list things within this many tiles")
	w := flag.Int("w", 1280, "game client width in pixels")
	h := flag.Int("h", 720, "game client height in pixels")
	quests := flag.Bool("quests", false, "include raw quest states")
	watchPath := flag.String("watch", "", "poll until D2R exits, appending game events as JSON lines to this file")
	flag.Parse()

	proc, err := memory.NewProcess()
	// In watch mode, wait up to 10 minutes for the game to start.
	for tries := 0; err != nil && *watchPath != "" && tries < 300; tries++ {
		time.Sleep(2 * time.Second)
		proc, err = memory.NewProcess()
	}
	if err != nil {
		fmt.Println(`{"error":"D2R not running"}`)
		os.Exit(1)
	}
	defer proc.Close()
	gr := memory.NewGameReader(proc)
	if gr.IsOnline() {
		fmt.Println(`{"error":"online session; refusing"}`)
		os.Exit(1)
	}
	if *watchPath != "" {
		os.Exit(watch(gr, *watchPath))
	}

	var d data.Data
	func() {
		defer func() {
			if r := recover(); r != nil {
				d = data.Data{}
			}
		}()
		d = gr.GetData()
	}()

	s := snapshot{InGame: d.PlayerUnit.Address != 0, Name: d.PlayerUnit.Name}
	if !s.InGame {
		s.Menus = gr.OpenMenus()
		out(s)
		return
	}
	p := d.PlayerUnit.Position
	s.Area = d.PlayerUnit.Area.Area().Name
	s.AreaID = int(d.PlayerUnit.Area)
	s.X, s.Y = p.X, p.Y
	if v, ok := d.PlayerUnit.FindStat(stat.Life, 0); ok {
		s.Life = v.Value
	}
	if v, ok := d.PlayerUnit.FindStat(stat.Level, 0); ok {
		s.Level = v.Value
	}
	s.Life >>= 8
	s.Menus = d.OpenMenus
	for _, a := range d.PlayerUnit.AvailableWaypoints {
		s.WPs = append(s.WPs, a.Area().Name)
	}
	if *quests {
		s.Quests = d.Quests
	}

	scale := float64(*w) / 1280.0
	place := func(t thing) thing {
		dx, dy := float64(t.X-p.X), float64(t.Y-p.Y)
		t.Dist = math.Round(math.Hypot(dx, dy)*10) / 10
		t.SX = int(float64(*w)/2 + (dx-dy)*19.8*scale)
		t.SY = int(float64(*h)/2 + (dx+dy)*9.9*scale)
		return t
	}
	for _, m := range d.Monsters {
		life := m.Stats[stat.Life]
		t := place(thing{Kind: "monster", Name: fmt.Sprint(m.Name), ID: int(m.UnitID), X: m.Position.X, Y: m.Position.Y, Life: life, Mode: fmt.Sprint(m.Mode), Hover: m.IsHovered})
		if t.Dist <= *radius {
			s.Near = append(s.Near, t)
		}
	}
	for _, o := range d.Objects {
		t := place(thing{Kind: "object", Name: fmt.Sprintf("obj%d", int(o.Name)), ID: int(o.ID), X: o.Position.X, Y: o.Position.Y, Mode: fmt.Sprint(o.Mode), Sel: o.Selectable, Hover: o.IsHovered})
		if t.Dist <= *radius {
			s.Near = append(s.Near, t)
		}
	}
	for _, it := range d.Inventory.AllItems {
		t := thing{Kind: "item", Name: string(it.Name), ID: int(it.UnitID), X: it.Position.X, Y: it.Position.Y, Where: string(it.Location.LocationType), Hover: it.IsHovered}
		if it.Location.LocationType == item.LocationGround {
			t = place(t)
			if t.Dist <= *radius {
				s.Near = append(s.Near, t)
			}
		} else {
			s.Carried = append(s.Carried, t)
		}
	}
	sort.Slice(s.Near, func(i, j int) bool { return s.Near[i].Dist < s.Near[j].Dist })
	out(s)
}

func out(s snapshot) {
	b, _ := json.Marshal(s)
	fmt.Println(string(b))
}
