//go:build windows

package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/Dune172/d2r-skill-randomizer/tools/ap-client/internal/apc"
)

const (
	// How long a "You received ..." line stays in the game's message box. Hints and
	// goals stay longer: they are worth reading twice.
	messageLife     = 12 * time.Second
	longMessageLife = 20 * time.Second
	// The box holds AP_MESSAGE_CAPACITY (600) bytes, so a line is cut to fit five of
	// them with the four line breaks between.
	maxMessageBytes = 115
	// The most lines shown at once; older ones leave early to make room.
	maxMessages = 5
	// The text box the mod adds to the chat panel, when the manifest does not name one.
	defaultMessageBox = "ArchipelagoMessages"
)

type shownMessage struct {
	text  string
	until time.Time
}

// messagePrefs are which optional kinds of message reach the game, kept across runs.
type messagePrefs struct {
	Chat  bool `json:"chat"`
	Joins bool `json:"joins"`
}

func defaultMessagePrefs() messagePrefs { return messagePrefs{Chat: true} }

func messagePrefsFile(stateDir string) string { return filepath.Join(stateDir, "messages.json") }

// loadMessagePrefs reads the saved /chat and /joins choices, or the defaults.
func loadMessagePrefs(stateDir string) messagePrefs {
	prefs := defaultMessagePrefs()
	if data, err := os.ReadFile(messagePrefsFile(stateDir)); err == nil {
		_ = json.Unmarshal(data, &prefs)
	}
	return prefs
}

func saveMessagePrefs(stateDir string, prefs messagePrefs) error {
	data, err := json.Marshal(prefs)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(stateDir, 0o755); err != nil {
		return err
	}
	return os.WriteFile(messagePrefsFile(stateDir), data, 0o644)
}

// fitMessage cuts a line to maxMessageBytes at a character boundary, marking the cut.
func fitMessage(text string) string {
	if len(text) <= maxMessageBytes {
		return text
	}
	const more = "..."
	cut := maxMessageBytes - len(more)
	for cut > 0 && !utf8.RuneStart(text[cut]) {
		cut--
	}
	return text[:cut] + more
}

// addMessage queues a server message for the game's message box, unless the player has
// switched its kind off. Called from the connection's read loop.
func (a *app) addMessage(m apc.GameMessage) {
	a.mu.Lock()
	defer a.mu.Unlock()
	switch m.Kind {
	case apc.MessageChat:
		if !a.messagePrefs.Chat {
			return
		}
	case apc.MessageJoin:
		if !a.messagePrefs.Joins {
			return
		}
	}
	life := messageLife
	if m.Kind == apc.MessageHint || m.Kind == apc.MessageGoal {
		life = longMessageLife
	}
	a.messages = append(a.messages, shownMessage{text: fitMessage(m.Text), until: time.Now().Add(life)})
	if a.dryRun {
		// Nothing is written to the game in a dry run, so say what would have been.
		logf("in-game message: %s", fitMessage(m.Text))
	}
	if len(a.messages) > maxMessages {
		a.messages = a.messages[len(a.messages)-maxMessages:]
	}
}

// messageText is what the box should show now: the live lines, oldest first.
func (a *app) messageText(now time.Time) string {
	a.mu.Lock()
	defer a.mu.Unlock()
	live := a.messages[:0]
	lines := make([]string, 0, len(a.messages))
	for _, m := range a.messages {
		if now.Before(m.until) {
			live = append(live, m)
			lines = append(lines, m.text)
		}
	}
	a.messages = live
	return strings.Join(lines, "\n")
}

// showMessages keeps the game's message box in step with the queue. It writes only when
// the text changes, and finds the box again whenever it has moved (a new game, say).
func (a *app) showMessages() {
	text := a.messageText(time.Now())
	if a.fakeGame != nil {
		return
	}
	name := defaultMessageBox
	a.mu.Lock()
	if a.man != nil && a.man.Tables.MessageBox != "" {
		name = a.man.Tables.MessageBox
	}
	a.mu.Unlock()
	if !a.gc.WidgetNamed(a.messageBox, name) {
		// Finding it walks the whole UI tree, so a missing box is looked for again only
		// every few seconds.
		if time.Now().Before(a.messageRetry) {
			return
		}
		a.messageRetry = time.Now().Add(5 * time.Second)
		addr, err := a.gc.FindWidget(name)
		if err != nil {
			// Normal for a moment while the game builds its screen; the note says so.
			a.note("messages", "in-game messages: waiting for the game's message box ("+err.Error()+")")
			a.messageBox = 0
			return
		}
		a.messageBox, a.messageShown, a.messageOK = addr, "", false
		a.note("messages", "in-game messages are on")
	}
	if a.messageOK && text == a.messageShown {
		return
	}
	if err := a.gc.SetWidgetText(a.messageBox, text); err != nil {
		a.note("messages", "in-game messages paused: "+err.Error())
		a.messageBox = 0
		return
	}
	a.messageShown, a.messageOK = text, true
	a.note("messages", "")
}

// setMessagePref is /chat and /joins: switch a kind of message on or off in the game, or
// say how it stands.
func (a *app) setMessagePref(cmd consoleCommand) {
	what := map[string]string{"chat": "room chat", "joins": "players joining and leaving"}[cmd.name]
	a.mu.Lock()
	prefs := a.messagePrefs
	a.mu.Unlock()
	field := &prefs.Chat
	if cmd.name == "joins" {
		field = &prefs.Joins
	}
	switch cmd.arg {
	case "":
	case "on", "yes", "1":
		*field = true
	case "off", "no", "0":
		*field = false
	default:
		logf("type /%s on or /%s off", cmd.name, cmd.name)
		return
	}
	state := "off"
	if *field {
		state = "on"
	}
	if cmd.arg == "" {
		logf("%s in the game: %s (type /%s on or /%s off)", what, state, cmd.name, cmd.name)
		return
	}
	a.mu.Lock()
	a.messagePrefs = prefs
	a.mu.Unlock()
	if err := saveMessagePrefs(a.stateDir, prefs); err != nil {
		logf("could not save the choice (%v); it lasts until the app is closed", err)
	}
	logf("%s in the game: %s", what, state)
}
