//go:build windows

package main

import (
	"testing"
	"time"
)

func TestReattachBacksOffToTenMinutes(t *testing.T) {
	want := []time.Duration{30 * time.Second, time.Minute, 2 * time.Minute, 4 * time.Minute, 8 * time.Minute, 10 * time.Minute, 10 * time.Minute}
	for n, d := range want {
		if got := reattachDelay(n); got != d {
			t.Fatalf("re-attach %d: waited %s, want %s", n+1, got, d)
		}
	}
	if got := reattachDelay(1000); got != 10*time.Minute {
		t.Fatalf("a long outage must stay at the cap, got %s", got)
	}
}

func TestSetupRetryBacksOffToTwoMinutes(t *testing.T) {
	want := []time.Duration{5 * time.Second, 10 * time.Second, 20 * time.Second, 40 * time.Second, 80 * time.Second, 2 * time.Minute, 2 * time.Minute}
	for n, d := range want {
		if got := setupRetryDelay(n); got != d {
			t.Fatalf("after %d failures: waited %s, want %s", n, got, d)
		}
	}
}

// A re-attach rescans the module, and a quest layout proved against the old scan must
// not survive it: a missed quest pattern would otherwise be read as completed quests.
func TestResetPlayerForgetsTheQuestLayout(t *testing.T) {
	a := &app{player: 0x1000, attached: true, questLayoutOK: true, pointSampleOK: true}
	a.resetPlayer()
	if a.questLayoutOK || a.attached || a.player != 0 || a.pointSampleOK {
		t.Fatalf("state survived a reset: %+v", a)
	}
}
