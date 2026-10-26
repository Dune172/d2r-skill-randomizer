package main

import (
	"encoding/json"
	"fmt"
	"math"
	"os"
	"time"

	"github.com/hectorgimenez/d2go/pkg/data"
	"github.com/hectorgimenez/d2go/pkg/data/item"
	"github.com/hectorgimenez/d2go/pkg/data/mode"
	"github.com/hectorgimenez/d2go/pkg/data/stat"
	"github.com/hectorgimenez/d2go/pkg/memory"
	"golang.org/x/sys/windows"
)

// watch polls the game and appends one JSON line per event, so a short play session
// can be graded afterwards by check-arena.mjs. Events:
//
//	char     entered a game: name, level, monster-level sample comes later
//	area     player changed area
//	monlevel highest monster level seen in a new area (tells Normal from Nightmare)
//	open     an object left its idle mode (chest opened, corpse searched, tree used)
//	kill     a monster entered its death/dead mode
//	drop     a new item on the ground, credited to the nearest open/kill in the last 4 s
//	pickup   an item joined the inventory, belt, cube, stash or equipment
//	gone     a carried item disappeared (handed to an NPC, consumed, dropped)
//	quest    a quest's state list changed
//	wptab    the waypoint menu's visible tab changed
//	menu     the quest log or waypoint menu opened/closed
//	left     the game ended (back to menu)
func watch(gr *memory.GameReader, path string) int {
	f, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		fmt.Println("ERROR:", err)
		return 1
	}
	defer f.Close()
	emit := func(ev string, fields map[string]any) {
		fields["ev"] = ev
		fields["t"] = time.Now().Format("15:04:05.000")
		b, _ := json.Marshal(fields)
		f.Write(append(b, '\n'))
		fmt.Println(string(b))
	}

	type source struct {
		kind, name string
		x, y       int
		at         time.Time
	}
	var (
		inGame     bool
		area       = -1
		objModes   = map[int]mode.ObjectMode{}
		dead       = map[int]bool{}
		ground     = map[int]bool{}
		carried    = map[int]string{}
		quests     = map[int]string{}
		wpTab      string
		menus      string
		levelAreas = map[int]bool{}
		recent     []source
		firstTick  = true
	)
	emit("start", map[string]any{"pid": gr.GetPID()})

	for {
		var d data.Data
		ok := func() (ok bool) {
			defer func() {
				if recover() != nil {
					ok = false
				}
			}()
			d = gr.GetData()
			return true
		}()
		if !ok {
			time.Sleep(300 * time.Millisecond)
			continue
		}
		now := time.Now()
		here := ok && d.PlayerUnit.Address != 0 && d.PlayerUnit.Area != 0
		if !here {
			if inGame {
				emit("left", map[string]any{})
				inGame, area, firstTick = false, -1, true
				objModes, dead, ground, carried, quests = map[int]mode.ObjectMode{}, map[int]bool{}, map[int]bool{}, map[int]string{}, map[int]string{}
				levelAreas = map[int]bool{}
			}
			if !processAlive(gr) {
				emit("exit", map[string]any{})
				return 0
			}
			time.Sleep(500 * time.Millisecond)
			continue
		}
		if !inGame {
			inGame = true
			lvl := 0
			if v, ok := d.PlayerUnit.FindStat(stat.Level, 0); ok {
				lvl = v.Value
			}
			skills := map[string]uint{}
			for id, pts := range d.PlayerUnit.Skills {
				if pts.Level > 0 {
					skills[fmt.Sprint(int(id))] = pts.Level
				}
			}
			emit("char", map[string]any{"name": d.PlayerUnit.Name, "level": lvl, "class": int(d.PlayerUnit.Class), "skills": skills})
		}
		if int(d.PlayerUnit.Area) != area {
			area = int(d.PlayerUnit.Area)
			emit("area", map[string]any{"area": d.PlayerUnit.Area.Area().Name, "areaId": area})
		}
		if !levelAreas[area] {
			best := 0
			for _, m := range d.Monsters {
				if l := m.Stats[stat.Level]; l > best {
					best = l
				}
			}
			if best > 0 {
				levelAreas[area] = true
				emit("monlevel", map[string]any{"areaId": area, "maxLevel": best})
			}
		}

		for _, o := range d.Objects {
			id := int(o.ID)
			prev, seen := objModes[id]
			objModes[id] = o.Mode
			if seen && prev == mode.ObjectModeIdle && o.Mode != mode.ObjectModeIdle && !firstTick {
				emit("open", map[string]any{"obj": int(o.Name), "x": o.Position.X, "y": o.Position.Y, "mode": int(o.Mode), "areaId": area})
				recent = append(recent, source{"open", fmt.Sprintf("obj%d", int(o.Name)), o.Position.X, o.Position.Y, now})
			}
		}
		for _, m := range d.Monsters {
			id := int(m.UnitID)
			if (m.Mode == mode.NpcDeath || m.Mode == mode.NpcDead) && !dead[id] {
				dead[id] = true
				if !firstTick {
					emit("kill", map[string]any{"monster": int(m.Name), "level": m.Stats[stat.Level], "x": m.Position.X, "y": m.Position.Y, "areaId": area})
					recent = append(recent, source{"kill", fmt.Sprintf("mon%d", int(m.Name)), m.Position.X, m.Position.Y, now})
				}
			}
		}
		keep := recent[:0]
		for _, s := range recent {
			if now.Sub(s.at) < 4*time.Second {
				keep = append(keep, s)
			}
		}
		recent = keep

		nowCarried := map[int]string{}
		for _, it := range d.Inventory.AllItems {
			id := int(it.UnitID)
			if it.Location.LocationType == item.LocationGround {
				if !ground[id] {
					ground[id] = true
					if !firstTick {
						best, bestD := "", math.MaxFloat64
						for _, s := range recent {
							if dd := math.Hypot(float64(s.x-it.Position.X), float64(s.y-it.Position.Y)); dd < bestD && dd < 8 {
								best, bestD = s.name, dd
							}
						}
						emit("drop", map[string]any{"item": string(it.Name), "classId": it.ID, "x": it.Position.X, "y": it.Position.Y, "src": best, "areaId": area})
					}
				}
				continue
			}
			nowCarried[id] = string(it.Name)
			if _, had := carried[id]; !had && !firstTick {
				emit("pickup", map[string]any{"item": string(it.Name), "classId": it.ID, "where": string(it.Location.LocationType)})
			}
		}
		for id, name := range carried {
			if _, still := nowCarried[id]; !still {
				emit("gone", map[string]any{"item": name})
			}
		}
		carried = nowCarried

		for q, st := range d.Quests {
			s := fmt.Sprint(st)
			if quests[int(q)] != s {
				if !firstTick {
					emit("quest", map[string]any{"quest": int(q), "states": s})
				}
				quests[int(q)] = s
			}
		}
		tab := ""
		for _, a := range d.PlayerUnit.AvailableWaypoints {
			tab += a.Area().Name + "|"
		}
		if tab != wpTab {
			wpTab = tab
			if tab != "" {
				emit("wptab", map[string]any{"tab": tab})
			}
		}
		m := fmt.Sprintf("quest=%v wp=%v", d.OpenMenus.QuestLog, d.OpenMenus.Waypoint)
		if m != menus {
			menus = m
			emit("menu", map[string]any{"menus": m})
		}
		firstTick = false
		time.Sleep(250 * time.Millisecond)
	}
}

func processAlive(gr *memory.GameReader) bool {
	return gr.GetPID() != 0 && pidRunning(gr.GetPID())
}

// pidRunning reports whether the D2R process is still alive.
func pidRunning(pid uint32) bool {
	h, err := windows.OpenProcess(windows.PROCESS_QUERY_LIMITED_INFORMATION, false, pid)
	if err != nil {
		return false
	}
	defer windows.CloseHandle(h)
	var code uint32
	if windows.GetExitCodeProcess(h, &code) != nil {
		return false
	}
	return code == 259 // STILL_ACTIVE
}
