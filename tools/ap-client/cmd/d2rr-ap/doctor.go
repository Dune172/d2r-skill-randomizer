//go:build windows

package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"github.com/Dune172/d2r-skill-randomizer/tools/ap-client/internal/apc"
	"github.com/Dune172/d2r-skill-randomizer/tools/ap-client/internal/game"
	"github.com/Dune172/d2r-skill-randomizer/tools/ap-client/internal/ids"
	"github.com/Dune172/d2r-skill-randomizer/tools/ap-client/internal/manifest"
	"github.com/Dune172/d2r-skill-randomizer/tools/ap-client/internal/setup"
	"os"
	"path/filepath"
)

// doctor is read-only unless explicitly asked to record difficulty calibration.
func doctor(args []string) int {
	f := flag.NewFlagSet("doctor", flag.ContinueOnError)
	manPath := f.String("manifest", "", "manifest JSON or mod zip")
	rootFlag := f.String("game-dir", "", "D2R installation folder")
	character := f.String("character", "", "expected character")
	stateFile := f.String("state-file", "", "slot state JSON for received counts")
	statusFile := f.String("status-file", "", "running client's status JSON")
	stateDir := f.String("state-dir", defaultStateDir(), "difficulty profile directory")
	asJSON := f.Bool("json", false, "machine-readable output")
	calibrate := f.Bool("calibrate-difficulty", false, "record a known-difficulty memory sample")
	difficulty := f.Int("difficulty", -1, "known difficulty: 0, 1, 2")
	if e := f.Parse(args); e != nil {
		return 2
	}
	report := map[string]any{"roomContract": apc.SlotContractVersion, "manifestContract": manifest.ContractVersion}
	issues := []string{}
	add := func(e error) {
		if e != nil {
			issues = append(issues, e.Error())
		}
	}
	if *statusFile != "" {
		raw, e := os.ReadFile(*statusFile)
		add(e)
		if e == nil {
			var status any
			e = json.Unmarshal(raw, &status)
			add(e)
			if e == nil {
				report["clientStatus"] = status
			}
		}
	}
	root, e := setup.Detect(*rootFlag)
	add(e)
	if e == nil {
		report["gameDirectory"] = root
	}
	received := 0
	haveReceived := false
	if *stateFile != "" {
		raw, e := os.ReadFile(*stateFile)
		add(e)
		if e == nil {
			var state struct {
				Room, Slot, Character string
				ItemCounts            map[string]int `json:"itemCounts"`
			}
			e = json.Unmarshal(raw, &state)
			add(e)
			if e == nil {
				report["session"] = state
				haveReceived = true
				received = state.ItemCounts[fmt.Sprint(ids.SkillPointItemID)] + state.ItemCounts[fmt.Sprint(ids.TrainingFragmentItemID)]/ids.FragmentsPerPoint
			}
		}
	}
	var m *manifest.Manifest
	if *manPath != "" {
		m, e = manifest.LoadFile(*manPath)
		add(e)
		if e == nil {
			report["manifest"] = m
			if root != "" {
				add(setup.VerifyInstalled(root, m))
				report["saveDirectory"] = defaultSaveDir(m.Savepath)
			}
		}
	} else {
		issues = append(issues, "pass -manifest <mod.zip> to verify mod and point mapping")
	}
	if !setup.GameRunning() {
		issues = append(issues, "D2R is not running; live checks are unavailable")
	} else {
		gc, e := game.Attach()
		add(e)
		if e == nil {
			defer gc.Close()
			// The build decides whether the UI and waypoint offsets come from measured
			// values or only from pattern scans, which can miss on an unknown build.
			build := gc.BuildTimestamp()
			known := game.KnownBuild(build)
			ui, waypoints := gc.OffsetsResolved()
			report["d2rBuild"] = fmt.Sprintf("0x%08x", build)
			report["d2rBuildKnown"] = known
			report["offsetsResolved"] = map[string]bool{"ui": ui, "waypoints": waypoints}
			// An unknown build alone is not a problem when the pattern scan found both.
			if !ui {
				issues = append(issues, "the UI block was not found; nothing will be granted until it is (re-run doctor after the game has been on screen for a while)")
			}
			if !waypoints {
				issues = append(issues, "the waypoint panel was not found; waypoint checks will come from the save instead")
			}
		}
		if e == nil && m != nil {
			proc, e := setup.Inspect(gc.PID())
			add(e)
			if e == nil {
				e = setup.VerifyProcess(proc, m)
				add(e)
			}
			if e == nil {
				report["processID"] = proc.ProcessId
				player := gc.PlayerUnit()
				if player == 0 {
					issues = append(issues, "enter a game to inspect the character")
				} else {
					name, e := gc.CharacterName(player)
					add(e)
					report["character"] = name
					cls, e := gc.ReadClass(player)
					add(e)
					report["classID"] = cls
					if e == nil && (cls < 0 || cls >= len(ids.Classes) || ids.Classes[cls] != m.CharacterClass) {
						issues = append(issues, "loaded class differs from manifest")
					}
					if *character != "" && name != *character {
						issues = append(issues, "loaded character differs from -character")
					}
					classIDs, _ := m.ClassSkillIDs()
					spent, e := gc.SpentSkillPoints(player, classIDs)
					add(e)
					report["spentHardPoints"] = spent
					if e == nil && haveReceived {
						balance, e := game.Balance(received, spent)
						add(e)
						report["pointBalance"] = balance
					}
					unspent, exists := gc.UnspentSkillPoints(player)
					report["pointStatExists"] = exists
					report["actualUnspent"] = unspent
					candidates := gc.DifficultyCandidates(player)
					report["difficultyCandidates"] = candidates
					build, e := setup.ExecutableHash(proc.ExecutablePath)
					add(e)
					if e == nil {
						profile, e := game.LoadDifficultyProfile(*stateDir, build)
						add(e)
						if e == nil && *calibrate {
							e = profile.Observe(*difficulty, candidates)
							add(e)
							if e == nil {
								add(profile.Save(*stateDir))
							}
						}
						layout, confirmed := profile.Layout()
						report["difficultyLayout"] = layout
						report["difficultyCalibrated"] = confirmed
						report["difficultyProfile"] = filepath.Join(*stateDir, "difficulty-"+build+".json")
					}
				}
			}
		}
	}
	report["issues"] = issues
	if *asJSON {
		raw, _ := json.MarshalIndent(report, "", "  ")
		fmt.Println(string(raw))
	} else {
		for _, key := range []string{"roomContract", "manifestContract", "gameDirectory", "manifest", "saveDirectory", "d2rBuild", "d2rBuildKnown", "offsetsResolved", "processID", "character", "classID", "session", "spentHardPoints", "pointBalance", "pointStatExists", "actualUnspent", "difficultyCandidates", "difficultyCalibrated", "difficultyLayout", "difficultyProfile", "clientStatus"} {
			if val, ok := report[key]; ok {
				raw, _ := json.Marshal(val)
				fmt.Printf("%s: %s\n", key, raw)
			}
		}
		for _, issue := range issues {
			fmt.Printf("CHECK: %s\n", issue)
		}
	}
	if len(issues) > 0 {
		return 1
	}
	return 0
}
