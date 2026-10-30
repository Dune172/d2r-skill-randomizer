//go:build windows

package main

import (
	"context"
	"sync"
	"time"

	"github.com/Dune172/d2r-skill-randomizer/tools/ap-client/internal/apc"
	"github.com/Dune172/d2r-skill-randomizer/tools/ap-client/internal/game"
	"github.com/Dune172/d2r-skill-randomizer/tools/ap-client/internal/grants"
	"github.com/Dune172/d2r-skill-randomizer/tools/ap-client/internal/manifest"
	"github.com/Dune172/d2r-skill-randomizer/tools/ap-client/internal/save"
)

// Poll live checks and reconcile what the character holds.
const pollInterval = 400 * time.Millisecond

// app owns the poll loop that joins the save file, the game and the server.
type app struct {
	man     *manifest.Manifest
	session *apc.Session
	conn    *apc.Conn
	saveDir string
	class   string
	dryRun  bool

	baseURL                                                     string
	modOut                                                      string
	saveDirFlag                                                 string
	characterFlag, gameDir, localManifest, stateDir, statusFile string
	installMod, launchGame, setupOK                             bool
	player                                                      uintptr
	pointSample                                                 int
	pointSampleOK                                               bool
	balance                                                     game.PointBalance
	difficultySource                                            string
	lastStatus                                                  time.Time
	difficultyProfile                                           game.DifficultyProfile

	mu       sync.Mutex
	lastSeen map[string]bool

	// Last value written, so the log speaks only on change.
	lastPointsWritten int

	// Skill points Archipelago has sent. The client hands the player unspent points and
	// the game builds the skill when one is spent.
	pointsReceived int
	// The last item summary logged, so it is repeated only when something changed.
	itemSummary string

	// From slot_data: which optional grants this room uses.
	statPointsPooled bool
	keyItems         bool
	deathLink        bool

	// The rune mailbox, from the manifest, and the offer currently on the mail stat
	// (0 when idle or not yet known).
	mailbox   grants.Mailbox
	mailOffer uint32
	// Whether a point pool is missing while points are owed; either asks the mailbox for
	// a Tonic of Renewal.
	needSkillPool, needStatPool bool
	// -mail-flip / -mail-skip were given and have not been carried out yet.
	flipMail bool
	skipMail bool

	// Test seams: a character made of a map, and a death that goes nowhere.
	fakeGame  gameView
	sendDeath func(ctx context.Context, cause string) error

	// A Skill Lock Trap withholds unspent skill points until this time.
	skillLockUntil time.Time

	// DeathLink. pendingDeaths are deaths received and not yet carried out; killStarted
	// is when the current one was written, so a write the game ignores can be noticed.
	pendingDeaths   int
	killStarted     time.Time
	killedByLink    bool
	killUnsupported bool
	wasDead         bool

	// Last line logged per topic, so a standing condition is stated once.
	notes map[string]string

	// The AP class's own 30 skill ids, from the manifest. Only these count as SPENT:
	// innate skills and anything granted by charstats sit in the list at level 1 and
	// were never paid for, so counting them would swallow points the player is owed.
	classSkillIDs map[int]bool

	gc       *game.Client
	attached bool

	// Goal from slot_data: the act boss and the difficulty to kill it on. goalDifficulty
	// is -1 until Connected arrives, so the goal is never reported against a guess.
	goalDifficulty int
	goalAct        int

	// Retained so the mod fetch can be retried without another Connected packet.
	slotData      map[string]any
	lastSetupTry  time.Time
	setupFailures int
	// The mod zip and manifest from the last successful fetch, so a retry after a
	// failed install does not ask the server to build the mod again.
	fetchedZip []byte
	fetchedMan *manifest.Manifest

	// Which optional check groups the room generated with, from slot_data. Sending a
	// check for a location the room does not contain is rejected by the server, so
	// these are read rather than assumed.
	includeWaypoints bool
	includeAreas     bool
	includeLevels    bool
	levelCap         int

	// Latest parsed save, kept so area checks can resolve the current difficulty. The
	// save is the only thing that proves which difficulties are even unlocked.
	lastState    *save.State
	lastDiffWarn time.Time

	// Difficulty the player told us they are on, or -1 to infer. Area checks need a
	// difficulty and no reliable automatic source has been found (see
	// internal/save/difficulty.go), so on a Nightmare or Hell goal this is how you get
	// them filed correctly while farming a difficulty you have already finished.
	difficultyOverride int
	warnedAssumed      bool

	// Why the game side is idle, and when each reason was last logged, so a standing
	// condition is stated once a minute rather than every 400ms.
	lastAttachWarn string
	attachWarnedAt map[string]time.Time

	// When the player unit first stopped resolving, used to decide when to re-attach.
	noPlayerSince time.Time
	// When the UI or waypoint offset was first seen unresolved, for the same reason, and
	// whether the next attach is such a retry (and so not worth announcing).
	offsetsMissingSince time.Time
	offsetsRetries      int
	reattaching         bool

	// The confirmed in-memory quest layout, once the save has proved one. Zero value
	// means unproven, and quest checks stay on the save path until it is.
	questLayout    game.QuestLayout
	questLayoutOK  bool
	warnedNoLayout bool
}

func (a *app) ready() bool {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.setupOK && a.slotData != nil && a.man != nil && a.saveDir != ""
}

func (a *app) run(ctx context.Context) {
	ticker := time.NewTicker(pollInterval)
	defer ticker.Stop()
	defer a.detachGame()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			a.writeStatus()
			if !a.ready() {
				// Retry rather than wait forever. ensureMod used to run ONLY on
				// connect, so a transient failure (D2RR server not up yet) wedged the
				// client permanently — no grants, no checks, and nothing in the log
				// after the initial error.
				a.retrySetup()
				continue
			}
			a.pollGame(ctx)
			a.pollSave(ctx)
			// After pollSave, which supplies the save state the difficulty check needs,
			// and after pollGame, which does the attaching.
			a.pollProgress(ctx)
		}
	}
}

// seen records a save-derived check key, so log lines fire once rather than every tick.
func (a *app) seen(key string) bool {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.lastSeen[key] {
		return true
	}
	a.lastSeen[key] = true
	return false
}
