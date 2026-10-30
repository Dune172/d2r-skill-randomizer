//go:build windows

package main

import (
	"strings"
	"time"

	"github.com/Dune172/d2r-skill-randomizer/tools/ap-client/internal/apc"
)

const (
	// How long a "You received ..." line stays in the game's message box.
	messageLife = 12 * time.Second
	// The most lines shown at once; older ones leave early to make room.
	maxMessages = 5
	// The text box the mod adds to the chat panel, when the manifest does not name one.
	defaultMessageBox = "ArchipelagoMessages"
)

type shownMessage struct {
	text  string
	until time.Time
}

// addMessage queues an item event for the game's message box. Called from the
// connection's read loop.
func (a *app) addMessage(e apc.ItemEvent) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.messages = append(a.messages, shownMessage{text: e.Text(), until: time.Now().Add(messageLife)})
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
			a.note("messages", "in-game messages are off: "+err.Error())
			a.messageBox = 0
			return
		}
		a.messageBox, a.messageShown, a.messageOK = addr, "", false
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
