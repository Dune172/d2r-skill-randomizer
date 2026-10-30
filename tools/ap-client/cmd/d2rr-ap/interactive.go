//go:build windows

package main

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"unsafe"

	"github.com/Dune172/d2r-skill-randomizer/tools/ap-client/internal/setup"
	"golang.org/x/sys/windows"
)

// console is the one reader of standard input: the questions asked at start and the
// chat afterwards share it, so nothing typed is lost between them.
var console = bufio.NewReader(os.Stdin)

// pauseOnExit keeps the window open after a fatal error. A double-clicked console
// window closes the moment the program exits, taking the error with it.
var pauseOnExit bool

const defaultAPPort = 38281

// roomChoice is what a player is asked for when the app is opened by double-click.
type roomChoice struct {
	Host     string `json:"host"`
	Port     int    `json:"port"`
	Slot     string `json:"slot"`
	GameDir  string `json:"gameDir,omitempty"`
	password string // never saved
}

func lastRoomFile(stateDir string) string { return filepath.Join(stateDir, "last-room.json") }

func loadLastRoom(stateDir string) roomChoice {
	var r roomChoice
	if raw, err := os.ReadFile(lastRoomFile(stateDir)); err == nil {
		_ = json.Unmarshal(raw, &r)
	}
	return r
}

func saveLastRoom(stateDir string, r roomChoice) {
	raw, _ := json.MarshalIndent(r, "", "  ")
	if os.MkdirAll(stateDir, 0o755) == nil {
		_ = os.WriteFile(lastRoomFile(stateDir), raw, 0o644)
	}
}

// parseRoomAddress accepts what a player is likely to paste: "archipelago.gg:38281",
// "/connect archipelago.gg:38281", a ws:// or wss:// URL, or a bare host (port 38281).
func parseRoomAddress(s string) (string, int, error) {
	s = strings.TrimSpace(s)
	s = strings.TrimSpace(strings.TrimPrefix(s, "/connect"))
	if strings.Contains(s, "://") {
		u, err := url.Parse(s)
		if err != nil || u.Hostname() == "" {
			return "", 0, fmt.Errorf("%q is not a room address", s)
		}
		s = u.Host
	}
	if s == "" || strings.ContainsAny(s, " /\\@") {
		return "", 0, fmt.Errorf("%q is not a room address; it looks like archipelago.gg:38281", s)
	}
	host, portText, found := strings.Cut(s, ":")
	if !found {
		return host, defaultAPPort, nil
	}
	port, err := strconv.Atoi(portText)
	if err != nil || port < 1 || port > 65535 || host == "" {
		return "", 0, fmt.Errorf("%q is not a room address; it looks like archipelago.gg:38281", s)
	}
	return host, port, nil
}

// ask prints a question and returns the trimmed answer, or fallback for an empty one.
func ask(question, fallback string) (string, error) {
	if fallback != "" {
		fmt.Printf("%s [%s]: ", question, fallback)
	} else {
		fmt.Printf("%s: ", question)
	}
	line, err := console.ReadString('\n')
	if err != nil && line == "" {
		return "", errors.New("no answer (the input was closed)")
	}
	if answer := strings.TrimSpace(line); answer != "" {
		return answer, nil
	}
	return fallback, nil
}

// askRoom is the start of a double-click: where the room is, who the player is, and
// where the game is installed, remembering the answers for next time.
func askRoom(stateDir string) (roomChoice, error) {
	setConsoleTitle("D2R Randomizer for Archipelago")
	fmt.Println("D2R Randomizer for Archipelago")
	fmt.Println("Connects your offline character to an Archipelago room, installs this room's")
	fmt.Println("mod and starts Diablo II: Resurrected. Press Enter to keep a value in [brackets].")
	fmt.Println()

	last := loadLastRoom(stateDir)
	choice := last
	lastAddress := ""
	if last.Host != "" {
		lastAddress = fmt.Sprintf("%s:%d", last.Host, last.Port)
	}
	for {
		answer, err := ask("Room address (for example archipelago.gg:38281)", lastAddress)
		if err != nil {
			return choice, err
		}
		if answer == "" {
			fmt.Println("  The room's host can give you its address.")
			continue
		}
		host, port, perr := parseRoomAddress(answer)
		if perr != nil {
			fmt.Println("  " + perr.Error())
			continue
		}
		choice.Host, choice.Port = host, port
		break
	}
	for {
		answer, err := ask("Your name in the room (the name in your player file)", last.Slot)
		if err != nil {
			return choice, err
		}
		if answer != "" {
			choice.Slot = answer
			break
		}
	}
	password, err := ask("Room password (press Enter if there is none)", "")
	if err != nil {
		return choice, err
	}
	choice.password = password

	// The game folder only has to be asked for when it is not where it usually is.
	if _, err := setup.Detect(choice.GameDir); err != nil {
		choice.GameDir = ""
		if _, err := setup.Detect(""); err != nil {
			for {
				answer, err := ask("Diablo II: Resurrected was not found. Paste the folder that holds D2R.exe", "")
				if err != nil {
					return choice, err
				}
				if dir, derr := setup.Detect(strings.Trim(answer, `"`)); derr == nil {
					choice.GameDir = dir
					break
				}
				fmt.Println("  D2R.exe is not in that folder.")
			}
		}
	}
	saveLastRoom(stateDir, choice)
	fmt.Println()
	return choice, nil
}

func setConsoleTitle(title string) {
	if p, err := windows.UTF16PtrFromString(title); err == nil {
		_, _, _ = windows.NewLazySystemDLL("kernel32.dll").NewProc("SetConsoleTitleW").Call(uintptr(unsafe.Pointer(p)))
	}
}

// waitForEnter holds a double-clicked window open so its last lines can be read.
func waitForEnter() {
	fmt.Print("\nPress Enter to close this window.")
	_, _ = console.ReadString('\n')
}
