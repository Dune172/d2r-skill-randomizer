//go:build windows

package main

import (
	"strings"
	"testing"

	"github.com/Dune172/d2r-skill-randomizer/tools/ap-client/internal/apc"
	"github.com/Dune172/d2r-skill-randomizer/tools/ap-client/internal/ids"
)

func TestReceivedLinesCountAndListTheLatest(t *testing.T) {
	items := []apc.ReceivedLine{
		{Item: "Gold", From: "Link", Location: "Hyrule"},
		{Item: "Progressive Skill Point", Location: "Normal A1: Den of Evil"},
		{Item: "Gold", From: "Link"},
	}
	got := strings.Join(receivedLines(items), "\n")
	for _, want := range []string{"received 3 items", "2 x Gold", "1 x Progressive Skill Point",
		"Gold from Link (Hyrule)", "Progressive Skill Point (your Normal A1: Den of Evil)"} {
		if !strings.Contains(got, want) {
			t.Fatalf("missing %q in\n%s", want, got)
		}
	}
	if receivedLines(nil)[0] != "No items received yet." {
		t.Fatal("empty list")
	}
}

func TestMissingAndChecksGroupByAct(t *testing.T) {
	q1, _ := ids.QuestLocationID(0, 0, 0)
	q2, _ := ids.QuestLocationID(0, 1, 0)
	area, _ := ids.AreaLocationID(0, 1)
	lvl, _ := ids.LevelLocationID(5)
	all := []int64{q1, q2, area, lvl}
	missing := []int64{q2, area, lvl}
	names := map[int64]string{q1: "Den", q2: "Radament", area: "Blood Moor", lvl: "Level 5"}
	name := func(id int64) string { return names[id] }

	got := strings.Join(missingLines(missing, name, ""), "\n")
	want := "3 checks still to find:\nNormal Act I:\n  Blood Moor\nNormal Act II:\n  Radament\nCharacter levels:\n  Level 5"
	if got != want {
		t.Fatalf("got\n%s\nwant\n%s", got, want)
	}
	if got := missingLines(missing, name, "act ii"); len(got) != 3 || got[2] != "  Radament" {
		t.Fatalf("filter: %q", got)
	}
	if got := missingLines(nil, name, ""); !strings.Contains(got[0], "every one") {
		t.Fatal(got)
	}

	checks := strings.Join(checksLines(all, missing), "\n")
	if !strings.Contains(checks, "Checks found: 1 of 4") || !strings.Contains(checks, "Normal Act I") ||
		!strings.Contains(checks, "1 / 2") {
		t.Fatal(checks)
	}
}

func TestMessagesAreFilteredAndCut(t *testing.T) {
	a := &app{messagePrefs: defaultMessagePrefs()}
	a.addMessage(apc.GameMessage{Kind: apc.MessageJoin, Text: "Link joined"})
	a.addMessage(apc.GameMessage{Kind: apc.MessageChat, Text: "Link: " + strings.Repeat("é", 100)})
	if len(a.messages) != 1 || len(a.messages[0].text) > maxMessageBytes || !strings.HasSuffix(a.messages[0].text, "...") {
		t.Fatalf("%+v", a.messages)
	}
	a.messagePrefs.Chat = false
	a.addMessage(apc.GameMessage{Kind: apc.MessageChat, Text: "Link: hi"})
	if len(a.messages) != 1 {
		t.Fatal("chat shown after /chat off")
	}
	// Five full lines and their breaks still fit the mod's 600-byte box.
	if 5*maxMessageBytes+4 > 600 {
		t.Fatal("five lines no longer fit the box")
	}
}

func TestMessagePrefsAreKept(t *testing.T) {
	dir := t.TempDir()
	a := &app{stateDir: dir, messagePrefs: loadMessagePrefs(dir)}
	if !a.messagePrefs.Chat || a.messagePrefs.Joins {
		t.Fatalf("defaults %+v", a.messagePrefs)
	}
	a.setMessagePref(consoleCommand{name: "joins", arg: "on"})
	a.setMessagePref(consoleCommand{name: "chat", arg: "off"})
	if got := loadMessagePrefs(dir); got.Chat || !got.Joins {
		t.Fatalf("saved %+v", got)
	}
}

func TestNewCommandsAreRecognised(t *testing.T) {
	for _, line := range []string{"/received", "/missing normal act ii", "/checks", "/hints", "/chat off", "/joins on"} {
		if _, ok := parseConsoleCommand(line); !ok {
			t.Fatalf("%q not recognised", line)
		}
	}
	cmd, _ := parseConsoleCommand("/missing Normal Act II")
	if cmd.arg != "normal act ii" {
		t.Fatalf("arg %q", cmd.arg)
	}
}
