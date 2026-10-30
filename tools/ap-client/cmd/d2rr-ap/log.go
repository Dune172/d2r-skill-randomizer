//go:build windows

package main

import (
	"fmt"
	"os"
	"time"
)

// warnAttach reports why the game side is idle, at most once a minute per reason.
//
// Per reason, not per call: two conditions that hold at once (the game is not running,
// and no character is bound) take turns being "the latest", and throttling only against
// the previous message would print both every poll.
//
// The client can look perfectly healthy from the log — connected, checks sending — while
// granting nothing at all, because checks come from the save and grants come from
// memory. Those are independent paths, and only one of them is noisy by nature.
func (a *app) warnAttach(reason string) {
	a.mu.Lock()
	if a.attachWarnedAt == nil {
		a.attachWarnedAt = map[string]time.Time{}
	}
	quiet := time.Since(a.attachWarnedAt[reason]) < time.Minute
	a.lastAttachWarn = reason
	if !quiet {
		a.attachWarnedAt[reason] = time.Now()
	}
	// What is owed and not yet in the game: the last computed target once spending is
	// known, otherwise everything received.
	pending := a.pointsReceived - a.lastPointsWritten
	if a.pointSampleOK {
		pending = a.balance.Unspent
	}
	a.mu.Unlock()

	if quiet {
		return
	}
	logf("%s", reason)
	if pending > 0 {
		logf("  %d skill point(s) are waiting to be granted until this resolves", pending)
	}
}

func (a *app) clearAttachWarning() {
	a.mu.Lock()
	a.lastAttachWarn = ""
	a.attachWarnedAt = nil
	a.mu.Unlock()
}

func logf(format string, args ...any) {
	fmt.Printf("%s  %s\n", time.Now().Format("15:04:05"), fmt.Sprintf(format, args...))
}

func fatal(format string, args ...any) {
	fmt.Fprintf(os.Stderr, format+"\n", args...)
	if pauseOnExit {
		waitForEnter()
	}
	os.Exit(1)
}
