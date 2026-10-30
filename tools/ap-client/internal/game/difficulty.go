//go:build windows

package game

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

// Candidate chains are documented in diablo2utils for D2R 3.1.91636:
// https://github.com/ChrisTitusTech/diablo2utils/blob/master/docs/d2r-memory-offsets.md
// This branch's build may differ. A value in [0,2] is only a candidate, not proof.
func (c *Client) DifficultyCandidates(player uintptr) map[string]int {
	return difficultyCandidates(c.proc.ReadIntoBuffer, player)
}
func difficultyCandidates(read memoryRead, player uintptr) map[string]int {
	out := map[string]int{}
	act, e := readUint(read, player+0x20, 8)
	if e != nil {
		return out
	}
	unitAct, e := readUint(read, player+0x18, 4)
	if e != nil || unitAct > 4 {
		return out
	}
	actual, e := readUint(read, uintptr(act)+0x28, 4)
	if e != nil || actual != unitAct {
		return out
	}
	for _, offset := range []uintptr{0x70, 0x78} {
		misc, e := readUint(read, uintptr(act)+offset, 8)
		if e != nil {
			continue
		}
		value, e := readUint(read, uintptr(misc)+0x830, 4)
		if e == nil && value < 3 {
			out[fmt.Sprintf("act+%x/misc+830", offset)] = int(value)
		}
	}
	return out
}

type DifficultyProfile struct {
	Build   string                 `json:"executableSHA256"`
	Samples map[int]map[string]int `json:"samples"`
}

func (p *DifficultyProfile) Observe(known int, candidates map[string]int) error {
	if known < 0 || known > 2 {
		return fmt.Errorf("calibration requires a known difficulty 0, 1 or 2")
	}
	matches := false
	for _, v := range candidates {
		if v == known {
			matches = true
		}
	}
	if !matches {
		return fmt.Errorf("no memory candidate matches the stated difficulty; offsets need investigation")
	}
	if p.Samples == nil {
		p.Samples = map[int]map[string]int{}
	}
	p.Samples[known] = candidates
	return nil
}
func (p DifficultyProfile) Layout() (string, bool) {
	// Zero-filled memory can imitate Normal. Require evidence from Normal AND a
	// higher difficulty, with exactly one chain matching every observation.
	if len(p.Samples) < 2 || p.Samples[0] == nil {
		return "", false
	}
	winners := []string{}
	for layout := range p.Samples[0] {
		good := true
		for expected, sample := range p.Samples {
			v, ok := sample[layout]
			if !ok || v != expected {
				good = false
			}
		}
		if good {
			winners = append(winners, layout)
		}
	}
	if len(winners) != 1 {
		return "", false
	}
	return winners[0], true
}
func (p DifficultyProfile) Resolve(candidates map[string]int) (int, bool) {
	layout, ok := p.Layout()
	if !ok {
		return 0, false
	}
	v, ok := candidates[layout]
	return v, ok && v >= 0 && v <= 2
}
func LoadDifficultyProfile(dir, build string) (DifficultyProfile, error) {
	p := DifficultyProfile{Build: build}
	raw, e := os.ReadFile(filepath.Join(dir, "difficulty-"+build+".json"))
	if os.IsNotExist(e) {
		return p, nil
	}
	if e != nil {
		return DifficultyProfile{Build: build}, e
	}
	e = json.Unmarshal(raw, &p)
	if e != nil {
		return DifficultyProfile{Build: build}, e
	}
	if p.Build != build {
		return DifficultyProfile{Build: build}, fmt.Errorf("difficulty profile build mismatch")
	}
	return p, nil
}
func (p DifficultyProfile) Save(dir string) error {
	if len(p.Build) != 64 {
		return fmt.Errorf("invalid executable fingerprint")
	}
	if e := os.MkdirAll(dir, 0755); e != nil {
		return e
	}
	raw, e := json.MarshalIndent(p, "", "  ")
	if e != nil {
		return e
	}
	path := filepath.Join(dir, "difficulty-"+p.Build+".json")
	if e = os.WriteFile(path+".tmp", raw, 0600); e != nil {
		return e
	}
	return os.Rename(path+".tmp", path)
}
