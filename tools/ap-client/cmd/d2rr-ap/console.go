//go:build windows

package main

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"os"
	"strings"
	"sync"
)

// The console is read by one goroutine. The questions asked at start, the chat while
// connected and the questions asked again after a refusal all take lines from it, so
// nothing typed is lost between them and none of them blocks the others on exit.
var (
	consoleOnce  sync.Once
	consoleLines chan string
	// consoleInput is where lines come from; tests replace it before the first read.
	consoleInput io.Reader = os.Stdin
)

func startConsole() {
	consoleLines = make(chan string)
	go func() {
		r := bufio.NewReader(consoleInput)
		for {
			line, err := r.ReadString('\n')
			if line != "" {
				consoleLines <- line
			}
			if err != nil {
				close(consoleLines)
				return
			}
		}
	}()
}

// readLine returns the next typed line, or ok false once input is closed.
func readLine() (string, bool) {
	consoleOnce.Do(startConsole)
	line, ok := <-consoleLines
	return line, ok
}

// readLineCtx is readLine that gives up when ctx ends.
func readLineCtx(ctx context.Context) (string, bool) {
	consoleOnce.Do(startConsole)
	select {
	case line, ok := <-consoleLines:
		return line, ok
	case <-ctx.Done():
		return "", false
	}
}

// consoleCommand is a line the app answers itself rather than sending to the room.
type consoleCommand struct {
	name string
	arg  string
}

// parseConsoleCommand recognises the app's own commands. Archipelago's server commands
// start with "!", so anything else goes to the room as chat.
func parseConsoleCommand(line string) (consoleCommand, bool) {
	fields := strings.Fields(strings.TrimSpace(line))
	if len(fields) == 0 || !strings.HasPrefix(fields[0], "/") {
		return consoleCommand{}, false
	}
	name := strings.ToLower(strings.TrimPrefix(fields[0], "/"))
	switch name {
	case "difficulty", "help", "chat", "joins", "received", "missing", "checks", "hints":
		arg := ""
		if len(fields) > 1 {
			arg = strings.ToLower(strings.Join(fields[1:], " "))
		}
		return consoleCommand{name: name, arg: arg}, true
	}
	return consoleCommand{}, false
}

// parseDifficultyArg reads /difficulty's argument: a name, its first letter or 0-2, or
// "auto" (-1) to let the app work it out.
func parseDifficultyArg(arg string) (int, error) {
	switch arg {
	case "normal", "n", "0":
		return 0, nil
	case "nightmare", "nm", "1":
		return 1, nil
	case "hell", "h", "2":
		return 2, nil
	case "auto", "a", "-1":
		return -1, nil
	}
	return 0, fmt.Errorf("type /difficulty normal, /difficulty nightmare, /difficulty hell or /difficulty auto")
}

func printConsoleHelp() {
	logf("Commands typed in this window:")
	logf("  /difficulty normal|nightmare|hell   say which difficulty you are playing now")
	logf("  /difficulty auto                    let the app work it out again")
	logf("  /received                           the items the room has sent you")
	logf("  /missing [filter]                   your checks still to find, e.g. /missing act ii")
	logf("  /checks                             how many checks you have found, act by act")
	logf("  /hints                              hints about your items and your checks")
	logf("  /chat on|off, /joins on|off         show room chat, or players joining, in the game")
	logf("  !hint <item>, !help                 Archipelago's own commands, sent to the room")
	logf("  anything else                       chat to the room")
}
