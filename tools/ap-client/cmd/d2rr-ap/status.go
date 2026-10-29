package main

import (
	"encoding/json"
	"os"
	"time"

	"github.com/swannysoft/d2rr-ap-client/internal/game"
)

type statusReport struct {
	Time                                                           string `json:"time"`
	Room                                                           string `json:"room"`
	StateFile                                                      string `json:"stateFile"`
	Connected, ItemStreamSynchronized, ModReady, CharacterAttached bool
	Character                                                      string
	Points                                                         game.PointBalance
	DifficultySource                                               string
	PausedReason                                                   string
}

func (a *app) writeStatus() {
	if a.statusFile == "" || time.Since(a.lastStatus) < time.Second {
		return
	}
	a.lastStatus = time.Now()
	a.mu.Lock()
	reason := a.lastAttachWarn
	a.mu.Unlock()
	report := statusReport{Time: time.Now().UTC().Format(time.RFC3339), Room: a.session.Identity(), StateFile: a.session.StatePath(), Connected: a.conn.Connected(), ItemStreamSynchronized: a.conn.Synchronized(), ModReady: a.setupOK, CharacterAttached: a.attached, Character: a.session.CharacterName(), Points: a.balance, DifficultySource: a.difficultySource, PausedReason: reason}
	raw, e := json.MarshalIndent(report, "", "  ")
	if e == nil {
		e = os.WriteFile(a.statusFile+".tmp", raw, 0600)
	}
	if e == nil {
		e = os.Rename(a.statusFile+".tmp", a.statusFile)
	}
	if e != nil {
		logf("writing status: %v", e)
	}
}
