//go:build windows

package main

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime/debug"
	"sort"
	"sync"
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

var (
	logMu   sync.Mutex
	logFile *os.File
)

// keepLogs is how many runs' log files are kept.
const keepLogs = 10

// openLogFile starts this run's log file under <stateDir>\logs and removes the oldest
// beyond keepLogs. A bug report needs more than the window's scrollback, and a
// double-clicked window takes its text with it when it closes.
func openLogFile(stateDir string) (string, error) {
	dir := filepath.Join(stateDir, "logs")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	path := filepath.Join(dir, "d2rr-ap-"+time.Now().Format("20060102-150405")+".log")
	f, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		return "", err
	}
	logMu.Lock()
	logFile = f
	logMu.Unlock()
	pruneLogs(dir, keepLogs)
	return path, nil
}

// pruneLogs keeps the newest keep log files in dir. Their names sort by time.
func pruneLogs(dir string, keep int) {
	old, _ := filepath.Glob(filepath.Join(dir, "d2rr-ap-*.log"))
	sort.Strings(old)
	for len(old) > keep {
		_ = os.Remove(old[0])
		old = old[1:]
	}
}

func writeLogLine(line string) {
	logMu.Lock()
	defer logMu.Unlock()
	if logFile != nil {
		_, _ = logFile.WriteString(line)
	}
}

func logf(format string, args ...any) {
	line := fmt.Sprintf("%s  %s\n", time.Now().Format("15:04:05"), fmt.Sprintf(format, args...))
	fmt.Print(line)
	writeLogLine(line)
}

func fatal(format string, args ...any) {
	msg := fmt.Sprintf(format, args...)
	fmt.Fprintln(os.Stderr, msg)
	writeLogLine(time.Now().Format("15:04:05") + "  FATAL: " + msg + "\n")
	if pauseOnExit {
		waitForEnter()
	}
	os.Exit(1)
}

// crashGuard turns a panic into a logged crash report. Deferred at the top of main and
// of every goroutine: an unchecked read of game memory can panic, and a double-clicked
// window that vanishes leaves nothing to report.
func crashGuard() {
	r := recover()
	if r == nil {
		return
	}
	logf("CRASH: %v\n%s", r, debug.Stack())
	logMu.Lock()
	path := ""
	if logFile != nil {
		path = logFile.Name()
	}
	logMu.Unlock()
	if path != "" {
		logf("Please report this at https://github.com/Dune172/d2r-skill-randomizer/issues with the log file:")
		logf("  %s", path)
	}
	if pauseOnExit {
		waitForEnter()
	}
	os.Exit(2)
}

// goSafe runs f on its own goroutine under crashGuard.
func goSafe(f func()) {
	go func() {
		defer crashGuard()
		f()
	}()
}
