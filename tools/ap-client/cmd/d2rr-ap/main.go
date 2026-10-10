// Command d2rr-ap connects an offline D2RR character to Archipelago.
//
// Checks come from the character's save file and from the running game. Everything the
// multiworld sends is granted by changing the value of a stat the game already holds.
package main

import (
	"bufio"
	"context"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/swannysoft/d2rr-ap-client/internal/apc"
	"github.com/swannysoft/d2rr-ap-client/internal/game"
	"github.com/swannysoft/d2rr-ap-client/internal/grants"
	"github.com/swannysoft/d2rr-ap-client/internal/ids"
	"github.com/swannysoft/d2rr-ap-client/internal/manifest"
	"github.com/swannysoft/d2rr-ap-client/internal/save"
	"github.com/swannysoft/d2rr-ap-client/internal/setup"
)

// Poll live checks and reconcile what the character holds.
const pollInterval = 400 * time.Millisecond

func main() {
	if len(os.Args) > 1 {
		switch os.Args[1] {
		case "doctor":
			os.Exit(doctor(os.Args[2:]))
		case "probe":
			os.Exit(probe(os.Args[2:]))
		case "saves":
			os.Exit(saves(os.Args[2:]))
		}
	}
	var (
		host       = flag.String("host", "archipelago.gg", "Archipelago server host")
		port       = flag.Int("port", 38281, "Archipelago server port")
		slot       = flag.String("slot", "", "Archipelago slot name (required)")
		password   = flag.String("password", "", "Archipelago room password")
		modOut     = flag.String("mod-out", ".", "directory to write the downloaded mod zip into")
		manPath    = flag.String("manifest", "", "use a local manifest/zip matching the room")
		baseURL    = flag.String("base-url", "https://d2rrandomizer.com", "D2RR server")
		stateDir   = flag.String("state-dir", defaultStateDir(), "where to persist session state")
		saveDir    = flag.String("save-dir", "", "D2R mod save folder (defaults from savepath)")
		character  = flag.String("character", "", "bind this slot to this character (auto-selects a single save)")
		gameDir    = flag.String("game-dir", "", "D2R installation folder (detected when omitted)")
		install    = flag.Bool("install", false, "install and verify the matching mod automatically")
		launch     = flag.Bool("launch", false, "install the mod and launch D2R")
		statusFile = flag.String("status-file", "", "write a diagnostic JSON status snapshot to this path")
		dryRun     = flag.Bool("dry-run", false, "do everything except write to the game")
		mailFlip   = flag.Bool("mail-flip", false, "the Cube refuses a waiting rune: offer it for the other Archipelago Sigil instead")
		diff       = flag.Int("difficulty", -1,
			"current difficulty for live checks: 0 normal, 1 nightmare, 2 hell; -1 uses calibrated memory or unambiguous saves")
	)
	flag.Parse()

	if *diff < -1 || *diff > 2 {
		fatal("-difficulty must be -1, 0, 1, or 2")
	}
	if *slot == "" {
		fatal("-slot is required")
	}

	// Echo the effective configuration before anything else runs.
	//
	// Checks come from the save file and grants come from memory — two independent
	// paths. So the client can look completely healthy (connected, checks flowing) while
	// granting nothing, and every flag that causes that is invisible once the log starts
	// scrolling. -dry-run in particular silently disables grants and nothing else.
	logf("server %s:%d  slot %q  mod source %s", *host, *port, *slot, *baseURL)
	if *dryRun {
		logf("DRY RUN: checks will be sent but nothing will ever be granted")
	}
	if *diff >= 0 {
		logf("difficulty pinned to %s for area checks", difficultyName(*diff))
	}

	// The mod is fetched AFTER connecting, because the seed lives in the room's
	// slot_data — the apworld picks it at generation time and the player has no way to
	// know it otherwise. -manifest short-circuits this for offline testing.
	var man *manifest.Manifest
	if *manPath != "" {
		m, err := manifest.LoadFile(*manPath)
		if err != nil {
			fatal("loading manifest: %v", err)
		}
		man = m
		logf("loaded manifest from %s", *manPath)
	}

	// --- session + connection -----------------------------------------------
	session := apc.PendingSession(*stateDir, *slot)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	app := &app{
		man:                man,
		session:            session,
		dryRun:             *dryRun,
		lastSeen:           map[string]bool{},
		goalDifficulty:     -1,
		goalAct:            len(ids.GoalQuestIndex) - 1,
		flipMail:           *mailFlip,
		difficultyOverride: *diff,
		baseURL:            *baseURL,
		modOut:             *modOut,
		saveDirFlag:        *saveDir,
		characterFlag:      *character, gameDir: *gameDir, installMod: *install || *launch, launchGame: *launch,
		localManifest: *manPath, stateDir: *stateDir, statusFile: *statusFile,
	}
	if man != nil {
		app.useManifest(man)
	}

	var conn *apc.Conn
	conn = apc.NewConn(*host, *port, *slot, *password, session, apc.Handler{
		OnConnected: func(slotData map[string]any, _ []int64) {
			logf("connected as %q (%d locations already checked)", *slot, len(session.AllChecks()))
			// The goal comes from the apworld, not from a flag: the client must not be
			// able to declare victory on a difficulty the room did not ask for. It also
			// decides how area checks resolve their difficulty, so it is read first.
			if v, ok := slotData["goal_difficulty"].(float64); ok {
				act := len(ids.GoalQuestIndex) - 1
				if g, ok := slotData["goal_act"].(float64); ok && g >= 0 && int(g) < len(ids.GoalQuestIndex) {
					act = int(g)
				}
				app.setGoal(int(v), act)
				logf("goal: kill %s on %s", goalBossNames[act], difficultyName(int(v)))
			}
			// Optional check groups. Defaulting to ON matches the apworld defaults; a
			// room that disabled them says so explicitly.
			app.mu.Lock()
			app.includeWaypoints = boolFromSlotData(slotData, "include_waypoints", true)
			app.includeAreas = boolFromSlotData(slotData, "include_areas", true)
			app.includeLevels = boolFromSlotData(slotData, "include_level_milestones", true)
			app.levelCap = ids.LevelCap(0, 0)
			if v, ok := slotData["level_cap"].(float64); ok {
				app.levelCap = int(v)
			}
			app.statPointsPooled = boolFromSlotData(slotData, "stat_points_pooled", false)
			if v, ok := slotData["horadric_keys"].(float64); ok {
				app.keyItems = v > 0
			}
			app.deathLink = boolFromSlotData(slotData, "death_link", false)
			deathLink := app.deathLink
			app.slotData = slotData
			app.mu.Unlock()
			if deathLink {
				conn.EnableDeathLink()
				logf("DeathLink is on")
			}
			app.recomputeDesired()
		},
		OnDeathLink: func(source, cause string) {
			if cause == "" {
				cause = source + " died"
			}
			logf("DeathLink: %s", cause)
			app.mu.Lock()
			app.pendingDeaths++
			app.mu.Unlock()
		},
		OnItems: func(s *apc.Session) {
			app.recomputeDesired()
		},
		OnPrint: func(text string) { logf("%s", strings.TrimSpace(text)) },
	})
	app.conn = conn

	go conn.Run(ctx)
	go chat(ctx, conn)

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, os.Interrupt, syscall.SIGTERM)
	defer signal.Stop(sig)
	go func() {
		select {
		case <-sig:
			logf("shutting down")
			cancel()
		case <-ctx.Done():
		}
	}()

	app.run(ctx)
}

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
	process                                                     setup.Process
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
	// -mail-flip was given and has not been recorded yet.
	flipMail bool

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
	slotData     map[string]any
	lastSetupTry time.Time

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

	// The confirmed in-memory quest layout, once the save has proved one. Zero value
	// means unproven, and quest checks stay on the save path until it is.
	questLayout    game.QuestLayout
	questLayoutOK  bool
	warnedNoLayout bool
}

// ensureMod downloads and loads the mod described by the room, once.
//
// slot_data is authoritative: the apworld chose the seed, class and savepath, and the
// mod must match them exactly or the manifest will describe skills the player does not
// have. Flags only override when explicitly given, for testing.
func (a *app) ensureMod(slotData map[string]any) error {
	a.mu.Lock()
	existing := a.man
	a.mu.Unlock()

	seedNum, ok := slotData["d2rr_seed"].(float64)
	seed := int(seedNum)
	class, _ := slotData["character_class"].(string)
	savepath, _ := slotData["savepath"].(string)
	if !ok || seedNum != float64(seed) || seed < 1 || class == "" || savepath == "" {
		return fmt.Errorf("room omitted seed, class or save folder")
	}
	options, _ := slotData["mod_options"].(map[string]any)
	if existing != nil {
		if err := existing.MatchRoom(seed, class, savepath); err != nil {
			return err
		}
		if err := a.prepareInstall(nil, existing); err != nil {
			return err
		}
		if a.saveDir == "" {
			return fmt.Errorf("local manifest could not be adopted; verify -save-dir")
		}
		a.setupOK = true
		return nil
	}

	logf("room wants seed %d, class %s — requesting mod ...", seed, class)
	zipBytes, man, err := manifest.Fetch(manifest.FetchRequest{
		BaseURL: a.baseURL, Seed: seed, CharacterClass: class, Savepath: savepath, Options: options,
	})
	if err != nil {
		return err
	}

	if err := man.MatchRoom(seed, class, savepath); err != nil {
		return err
	}
	if err := os.MkdirAll(a.modOut, 0755); err != nil {
		return err
	}
	out := filepath.Join(a.modOut, man.ModName+".zip")
	if err := os.WriteFile(out, zipBytes, 0o644); err != nil {
		return fmt.Errorf("writing mod zip: %w", err)
	}
	logf("mod written to %s", out)
	logf(`INSTALL: rerun with -install (or -launch) to install and verify the downloaded mod:`)
	logf("  D2R.exe -mod %s -txt", man.ModName)

	if err := a.prepareInstall(zipBytes, man); err != nil {
		return err
	}
	a.useManifest(man)
	if a.saveDir == "" {
		return fmt.Errorf("manifest or save folder could not be adopted")
	}
	a.setupOK = true
	return nil
}

// useManifest adopts a manifest and derives everything downstream of it.
func (a *app) useManifest(man *manifest.Manifest) {
	saveDir := a.saveDirFlag
	expectedSaveDir := defaultSaveDir(man.Savepath)
	if saveDir == "" {
		saveDir = expectedSaveDir
	}
	if absolute, e := filepath.Abs(saveDir); e != nil || !strings.EqualFold(absolute, expectedSaveDir) {
		logf("ERROR: -save-dir must match the installed mod's save folder %s", expectedSaveDir)
		return
	}
	classIDs, err := man.ClassSkillIDs()
	if err != nil {
		logf("ERROR: %v", err)
		return
	}

	a.mu.Lock()
	a.man = man
	a.class = man.CharacterClass
	a.saveDir = saveDir
	a.classSkillIDs = classIDs
	a.mailbox = mailboxFor(man.Tables)
	a.mailOffer = 0
	a.mu.Unlock()

	logf("manifest: seed %d, class %s, savepath %s",
		man.Seed, man.CharacterClass, man.Savepath)
	logf("watching saves in %s", saveDir)

	// A missing save folder is the difference between "no checks yet" and "checks will
	// NEVER be detected", and the two look identical in the log. The usual cause is an
	// installed mod whose modinfo savepath differs from the one this manifest describes
	// — for example a mod downloaded from the /archipelago page, which uses its own
	// savepath field. Say so plainly rather than sitting silent forever.
	if _, err := os.Stat(saveDir); os.IsNotExist(err) {
		logf("NOTE: that folder does not exist yet.")
		logf("      Normal if you have not created the character. But if you HAVE, the")
		logf("      installed mod is saving somewhere else — check the savepath in")
		logf("      <D2R>\\mods\\%s\\%s.mpq\\modinfo.json and either reinstall the mod",
			man.ModName, man.ModName)
		logf("      this client downloaded, or restart with -save-dir <that folder>.")
	}

	a.recomputeDesired()
}

// retrySetup re-attempts the mod fetch using the slot_data we already have.
func (a *app) retrySetup() {
	a.mu.Lock()
	sd := a.slotData
	last := a.lastSetupTry
	a.mu.Unlock()

	if sd == nil || time.Since(last) < 5*time.Second {
		return
	}
	a.mu.Lock()
	a.lastSetupTry = time.Now()
	a.mu.Unlock()

	if err := a.ensureMod(sd); err != nil {
		a.warnAttach(fmt.Sprintf("cannot prepare the mod (retrying): %v", err))
	}
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
			a.pollGame()
			a.pollSave(ctx)
			// After pollSave, which supplies the save state the difficulty check needs,
			// and after pollGame, which does the attaching.
			a.pollProgress(ctx)
		}
	}
}

// recomputeDesired derives the point entitlement from the authoritative item stream.
//
// Derived from counts rather than accumulated incrementally, so duplicates, out-of-order
// delivery and full resyncs all resolve to the same answer with no reconciliation.
func (a *app) recomputeDesired() {
	counts := a.session.Counts(ids.SkillPointItemID, ids.TrainingFragmentItemID,
		ids.StatPointsItemID, ids.HoradricKeyItemID)
	got := counts[0] + counts[1]/ids.FragmentsPerPoint
	summary := fmt.Sprintf("items: %d skill point(s) received (%d fragments, %d stat point bundles, %d Horadric Keys)",
		got, counts[1], counts[2], counts[3])

	a.mu.Lock()
	changed := summary != a.itemSummary
	a.pointsReceived = got
	a.itemSummary = summary
	a.mu.Unlock()

	if changed {
		logf("%s", summary)
	}
}

// pollSave reads the character file and reports any newly checked locations.
func (a *app) pollSave(ctx context.Context) {
	a.mu.Lock()
	saveDir := a.saveDir
	goal, wantWaypoints := a.goalDifficulty, a.includeWaypoints
	a.mu.Unlock()
	path, err := a.characterSave(saveDir)
	if err != nil {
		a.warnAttach(err.Error())
		return
	}
	paths := []string{path}

	var newIDs []int64
	for _, p := range paths {
		st, err := save.ParseFile(p)
		if err != nil {
			continue
		} // a save may be mid-flush
		if st.Name != a.session.CharacterName() {
			a.warnAttach("save header does not match the bound character")
			continue
		}

		// Never send a check for a difficulty the character cannot have entered.
		//
		// D2R flags the Act I town waypoint ACTIVE IN ALL THREE difficulty blocks the
		// moment a character is created, so a brand-new save reports Rogue Encampment
		// for Normal, Nightmare and Hell. Measured on a fresh character: 3 waypoint
		// checks before leaving town. Sending those hands the player two free checks
		// they never earned, and on a Normal-goal room they name locations the room
		// does not even contain.
		//
		// Beating Baal is what unlocks the next difficulty, so this is exactly the
		// bound. It can never suppress a legitimate check: you cannot complete a quest
		// or reach a waypoint in a difficulty you cannot enter.
		maxDifficulty := save.HighestUnlockedDifficulty(st)
		if maxDifficulty > goal {
			maxDifficulty = goal
		}

		for _, q := range st.CompletedQuests {
			if q.Difficulty > maxDifficulty {
				continue
			}
			if id, ok := ids.QuestLocationID(q.Difficulty, q.Act, q.Index); ok && a.conn.KnownLocation(id) {
				if key := q.ID(); !a.seen(key) {
					newIDs = append(newIDs, id)
					logf("check: %s %s (A%d)", save.DifficultyNames[q.Difficulty], q.Name, q.Act+1)
				}
			}
		}
		for _, w := range st.ActiveWaypoints {
			if !wantWaypoints || w.Difficulty > maxDifficulty {
				continue
			}
			if id, ok := ids.WaypointLocationID(w.Difficulty, w.Index); ok {
				if key := w.ID(); !a.seen(key) {
					newIDs = append(newIDs, id)
				}
			}
		}
		a.maybeReportGoal(ctx, st)

		// Kept for the area checks, which need the save to establish which
		// difficulties the character has actually unlocked.
		a.mu.Lock()
		a.lastState = st
		a.mu.Unlock()
	}
	a.sendChecks(ctx, newIDs)
}

// sendChecks persists then transmits. Persist BEFORE sending: a crash between the two
// costs a duplicate send, which the server dedupes, whereas the reverse order loses the
// check permanently.
func (a *app) sendChecks(ctx context.Context, newIDs []int64) {
	// The room decides which locations exist: nothing past the goal boss, and nothing
	// from a group of checks the slot switched off.
	wanted := newIDs[:0]
	for _, id := range newIDs {
		if a.conn.KnownLocation(id) {
			wanted = append(wanted, id)
		}
	}
	newIDs = wanted
	if len(newIDs) == 0 {
		return
	}
	added, err := a.session.AddChecks(newIDs)
	if err != nil {
		logf("persisting checks failed: %v", err)
		a.mu.Lock()
		a.lastSeen = map[string]bool{}
		a.mu.Unlock()
		return
	}
	if len(added) == 0 {
		return
	}
	if a.conn.Connected() {
		if err := a.conn.SendChecks(ctx, added); err != nil {
			logf("send failed (%v); queued for reconnect", err)
		}
	} else {
		logf("offline: %d check(s) queued", len(added))
	}
}

// pollProgress emits the checks that only memory can see: the area the player is
// standing in, and the character level they have reached.
//
// Area checks are 411 of the 707 locations: without them a large pool has nowhere to go.
func (a *app) pollProgress(ctx context.Context) {
	if a.gc == nil || !a.attached {
		return
	}
	a.mu.Lock()
	wantWaypoints := a.includeWaypoints
	wantAreas, wantLevels, cap := a.includeAreas, a.includeLevels, a.levelCap
	st := a.lastState
	goal := a.goalDifficulty
	a.mu.Unlock()

	if goal < 0 {
		return
	}
	if res := a.currentDifficulty(st); !res.OK {
		a.warnDifficulty(res.Reason)
	}

	prog, ok := a.gc.Progress()
	if !ok {
		return // between game states; a half-loaded unit must not produce a check
	}

	var newIDs []int64

	if wantLevels {
		// Every level from 2 up to the current one, not just the current one: the
		// client may have been down while the character levelled, and unlike an area
		// a level cannot be revisited to re-trigger the check.
		for clvl := ids.LevelMin; clvl <= prog.CharLevel && clvl <= cap; clvl++ {
			id, ok := ids.LevelLocationID(clvl)
			if !ok {
				continue
			}
			if key := fmt.Sprintf("lvl:%d", clvl); !a.seen(key) {
				newIDs = append(newIDs, id)
				logf("check: reached level %d", clvl)
			}
		}
	}

	// Waypoints, read LIVE from the panel rather than waited for in the save.
	//
	// These duplicate what pollSave eventually finds, deliberately: the save version is
	// authoritative and complete but can be a whole session late, while this one is
	// immediate and covers only the current act. Both produce the same `wp:d:i` dedupe
	// key, so whichever arrives first wins and the other is a no-op.
	if res := a.currentDifficulty(st); wantWaypoints && res.OK {
		for _, areaID := range a.gc.AvailableWaypointAreaIDs() {
			index, known := ids.WaypointIndexForLevelID(areaID)
			if !known {
				continue
			}
			id, ok := ids.WaypointLocationID(res.Difficulty, index)
			if !ok {
				continue
			}
			if key := fmt.Sprintf("wp:%d:%d", res.Difficulty, index); !a.seen(key) {
				newIDs = append(newIDs, id)
				logf("check: waypoint %s (%s)", areaLabel(areaID),
					save.DifficultyNames[res.Difficulty])
			}
		}
	}

	// Quests, read live once the layout has been proven against the save.
	if res := a.currentDifficulty(st); res.OK {
		newIDs = append(newIDs, a.liveQuestChecks(st, res.Difficulty)...)
	}

	if wantAreas {
		if index, known := ids.AreaIndexForLevelID(prog.AreaLevelID); known {
			// Attributing an area to the wrong difficulty means the right location is
			// never sent, which strands whatever item fill put there — in a multiworld,
			// somebody else's progression.
			res := a.currentDifficulty(st)
			if res.NeedsOverrideWarning() {
				a.warnAssumedDifficulty(res)
			}
			if !res.OK {
				a.warnDifficulty(res.Reason)
			} else if id, ok := ids.AreaLocationID(res.Difficulty, index); ok {
				key := fmt.Sprintf("area:%d:%d", res.Difficulty, index)
				if !a.seen(key) {
					newIDs = append(newIDs, id)
					logf("check: entered %s (%s)", ids.AreaLabels[index],
						save.DifficultyNames[res.Difficulty])
				}
			}
		}
	}

	if a.gc.PlayerUnit() != a.player {
		a.mu.Lock()
		a.lastSeen = map[string]bool{}
		a.mu.Unlock()
		a.resetPlayer()
		return
	}
	a.sendChecks(ctx, newIDs)
}

// warnDifficulty reports an undeterminable difficulty at most once a minute.
//
// This must not be silent: area checks are most of the location pool, so a room whose
// area checks never send is unwinnable for everyone in it, and the only place that
// surfaces is here.
// warnAssumedDifficulty fires once when area checks start running on an assumption.
//
// The assumption is that you are playing the hardest difficulty you have unlocked. That
// holds while advancing and breaks the moment you go back to farm, so it must be visible
// rather than quietly wrong.
func (a *app) warnAssumedDifficulty(res save.DifficultyResult) {
	a.mu.Lock()
	already := a.warnedAssumed
	a.warnedAssumed = true
	a.mu.Unlock()
	if already {
		return
	}
	logf("area checks assume you are playing %s (the highest difficulty you have unlocked).",
		save.DifficultyNames[res.Difficulty])
	logf("  If you go back to farm an easier difficulty, restart with -difficulty %d..%d",
		0, res.Unlocked)
	logf("  so the checks are filed correctly.")
}

// liveQuestChecks returns quest checks visible in memory but not yet in the save.
//
// The in-memory quest block's layout is NOT documented and the candidates disagree --
// d2go reads a byte per quest at act bases {0,8,16,24,34}, breaking its own stride on
// Act V, while the .d2s uses 16 bytes per act and a word per quest. Committing to the
// wrong one does not fail loudly: it yields a plausible, wrong set of completed quests
// and sends checks the player never earned, which in a multiworld releases other
// people's items early and cannot be undone.
//
// So the save is used as ground truth to prove a layout before any of this is trusted,
// and until it does, quests keep arriving the save way. Calibration needs at least one
// completed quest and an unambiguous match; see game.CalibrateQuestLayout.
func (a *app) liveQuestChecks(st *save.State, difficulty int) []int64 {
	if st == nil {
		return nil // calibration needs a parsed save before memory can prove anything
	}
	block := a.gc.QuestBytes()
	if len(block) < game.QuestBlockSize {
		return nil
	}

	fromSave := map[game.QuestID]bool{}
	for _, q := range st.CompletedQuests {
		if q.Difficulty == difficulty {
			fromSave[game.QuestID{Act: q.Act, Index: q.Index}] = true
		}
	}

	a.mu.Lock()
	layout, ok := a.questLayout, a.questLayoutOK
	a.mu.Unlock()

	if !ok {
		// Only ever calibrate against a save that is up to date. A block holding a
		// quest the save has not recorded yet is exactly the situation this feature
		// exists for, and also exactly when an exact match is impossible -- so a failed
		// calibration here is normal, not an error.
		layout, ok = game.CalibrateQuestLayout(block, fromSave)
		if !ok {
			a.warnNoQuestLayout(len(fromSave))
			return nil
		}
		a.mu.Lock()
		a.questLayout, a.questLayoutOK = layout, true
		a.mu.Unlock()
		logf("quest layout confirmed against the save: %s", layout.Name)
		logf("  quest checks now come from memory instead of waiting for a save write")
	}

	var out []int64
	for _, q := range game.CompletedQuests(block, layout) {
		if fromSave[q] {
			continue // the save already has it; pollSave will send it, or already did
		}
		id, valid := ids.QuestLocationID(difficulty, q.Act, q.Index)
		if !valid {
			continue
		}
		key := fmt.Sprintf("q:%d:%d:%d", difficulty, q.Act, q.Index)
		if a.seen(key) {
			continue
		}
		out = append(out, id)
		logf("check: %s (A%d) — from memory, ahead of the save",
			save.QuestNames[q.Act][q.Index], q.Act+1)
	}
	return out
}

// warnNoQuestLayout explains, once, why quest checks are still on the slow path.
func (a *app) warnNoQuestLayout(saveCount int) {
	a.mu.Lock()
	already := a.warnedNoLayout
	a.warnedNoLayout = true
	a.mu.Unlock()
	if already || saveCount == 0 {
		return // with no completed quests there is nothing to calibrate against yet
	}
	logf("could not confirm the in-memory quest layout against the save (%d quest(s) known)",
		saveCount)
	logf("  quest checks will keep coming from the save, which is correct but slower")
}

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
	pending := a.pointsReceived - a.lastPointsWritten
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

func (a *app) warnDifficulty(reason string) {
	a.mu.Lock()
	quiet := time.Since(a.lastDiffWarn) < time.Minute
	if !quiet {
		a.lastDiffWarn = time.Now()
	}
	a.mu.Unlock()
	if !quiet {
		logf("area checks PAUSED: cannot determine the current difficulty (%s)", reason)
	}
}

func boolFromSlotData(slotData map[string]any, key string, fallback bool) bool {
	switch v := slotData[key].(type) {
	case bool:
		return v
	case float64: // JSON numbers, which is how a Python bool can arrive
		return v != 0
	default:
		return fallback
	}
}

var goalBossNames = []string{"Andariel", "Duriel", "Mephisto", "Diablo", "Baal"}

func (a *app) setGoal(difficulty, act int) {
	a.mu.Lock()
	a.goalDifficulty, a.goalAct = difficulty, act
	a.mu.Unlock()
}

// chat forwards typed lines to the room, so "!hint" and the other server commands work
// from this window like any Archipelago client.
func chat(ctx context.Context, conn *apc.Conn) {
	lines := bufio.NewScanner(os.Stdin)
	for lines.Scan() {
		text := strings.TrimSpace(lines.Text())
		if text == "" {
			continue
		}
		if !conn.Connected() {
			logf("not connected; \"%s\" was not sent", text)
			continue
		}
		if err := conn.Say(ctx, text); err != nil {
			logf("sending chat failed: %v", err)
		}
	}
}

func difficultyName(d int) string {
	if d >= 0 && d < len(save.DifficultyNames) {
		return save.DifficultyNames[d]
	}
	return "?"
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

// pollGame verifies the mod and bound character before writing a point balance.
func (a *app) pollGame() {
	if a.gc == nil {
		gc, err := game.Attach()
		if err != nil {
			// Report it ONCE. Silence here is indistinguishable from "the game is not
			// running", and it hides the case that actually matters: attached-but-
			// refused, where checks keep flowing from the save while no skill is ever
			// granted. That looked exactly like a broken grant path.
			a.warnAttach(fmt.Sprintf("cannot attach to D2R: %v", err))
			return
		}
		proc, err := setup.Inspect(gc.PID())
		if err == nil {
			err = setup.VerifyProcess(proc, a.man)
		}
		if err != nil {
			a.warnAttach(fmt.Sprintf("game verification: %v", err))
			gc.Close()
			return
		}
		a.process = proc
		if build, e := setup.ExecutableHash(proc.ExecutablePath); e == nil {
			a.difficultyProfile, _ = game.LoadDifficultyProfile(a.stateDir, build)
		}
		a.gc = gc
		a.clearAttachWarning()
		logf("attached to D2R")
	}

	if a.gc.IsOnline() {
		a.resetPlayer()
		a.warnAttach("enter an offline character in the room's mod")
		return
	}
	player := a.gc.PlayerUnit()
	if player == 0 {
		wasAttached := a.attached
		a.resetPlayer()
		if wasAttached {
			logf("left the game; waiting for a character")
		}
		a.attached = false

		// RE-ATTACH if this persists. d2go resolves its offsets exactly once, by
		// pattern-scanning the module when the process is opened. Attaching while D2R
		// is still starting up can bake in a bad unit-table offset, and a bad unit
		// table is indistinguishable from an empty one — the client reports "no
		// character loaded" forever while the player is demonstrably in a game, and
		// cmd/grant, which attaches fresh every run, resolves the same character fine.
		//
		// A fresh attach re-runs the scan, so the recovery is simply to stop reusing
		// the old one.
		if a.noPlayerSince.IsZero() {
			a.noPlayerSince = time.Now()
		} else if time.Since(a.noPlayerSince) > 10*time.Second {
			logf("no character after 10s; re-attaching in case the offsets resolved badly")
			a.gc.Close()
			a.gc = nil
			a.noPlayerSince = time.Time{}
			return
		}

		a.warnAttach("attached to D2R but no character is loaded " +
			"(you are at the menu, or the game is still loading)")
		return
	}
	a.noPlayerSince = time.Time{}
	name, err := a.gc.CharacterName(player)
	cls, classErr := a.gc.ReadClass(player)
	if err != nil || classErr != nil || cls < 0 || cls >= len(ids.Classes) || ids.Classes[cls] != a.class {
		a.attached = false
		a.warnAttach("loaded character class/name does not match the room")
		return
	}
	if a.characterFlag != "" && name != a.characterFlag {
		a.attached = false
		a.warnAttach("loaded character differs from -character")
		return
	}
	if bound := a.session.CharacterName(); bound != "" && name != bound {
		a.attached = false
		a.warnAttach(fmt.Sprintf("slot is bound to %s; loaded %s", bound, name))
		return
	}
	if err := a.bindCurrentCharacter(name); err != nil {
		a.attached = false
		a.warnAttach(err.Error())
		return
	}
	if name != a.session.CharacterName() {
		a.attached = false
		a.warnAttach("loaded character differs from the selected save")
		return
	}
	if a.player != player {
		a.resetPlayer()
		a.player = player
	}
	a.attached = true
	if a.gc.QuitMenuOpen() {
		return
	} // avoid writing during exit; there are no nodes to unlink
	if !a.conn.Synchronized() {
		a.warnAttach("waiting for the server's complete item replay before granting points")
		return
	}

	if a.dryRun {
		return
	}

	a.applySkillPoints(player)
	a.applyGrants(context.Background(), player)
}

// applySkillPoints holds unspent skill points at (sent by Archipelago) − (already spent).
//
// Expressed as a target rather than an increment on purpose. Points are recomputed from
// scratch every poll, so duplicate item deliveries, out-of-order arrivals and full
// resyncs all converge on the same answer with no reconciliation.
//
// It also quietly undoes the point the game grants on level-up. charstats keeps
// SkillsPerLevel at 1 so the SkillPoints STAT EXISTS to be written at all (the stat list
// is sparse; a character that never held a point has no entry), and this write is what
// reconciles any unspent level-up points. Points spent between polls cannot be undone.
func (a *app) applySkillPoints(player uintptr) {
	a.mu.Lock()
	sent := a.pointsReceived
	classIDs := a.classSkillIDs
	a.mu.Unlock()

	if len(classIDs) == 0 {
		return // no manifest yet, so "spent" cannot be computed
	}
	spent, err := a.gc.SpentSkillPoints(player, classIDs)
	if err != nil {
		a.pointSampleOK = false
		a.warnAttach("point accounting paused: " + err.Error())
		return
	}
	balance, err := game.Balance(sent, spent)
	if err != nil {
		a.warnAttach(err.Error())
		return
	}
	a.balance = balance
	// A respec or partial rebuild must settle before its lower total refunds points.
	if !a.pointSampleOK || a.pointSample != spent {
		a.pointSample = spent
		a.pointSampleOK = true
		return
	}
	want := balance.Unspent
	a.mu.Lock()
	locked := time.Now().Before(a.skillLockUntil)
	a.mu.Unlock()
	if locked {
		want = 0 // a Skill Lock Trap: the points come back when it wears off
	}

	existed, err := a.gc.SetUnspentSkillPoints(player, want)
	if err != nil {
		a.warnAttach("setting skill points: " + err.Error())
		return
	}
	if !existed {
		// Normal on a fresh character: the game creates the entry on the first
		// level-up. Worth saying once, because "no skills are arriving" otherwise
		// looks identical to a broken client.
		a.warnAttach("waiting for the game to create the skill-point stat (it appears on your " +
			"first level-up, or when you right-click the Draught of Attunement)")
		return
	}
	a.clearAttachWarning()

	a.mu.Lock()
	changed := a.lastPointsWritten != want
	a.lastPointsWritten = want
	a.mu.Unlock()
	if changed {
		logf("skill points: %d unspent (%d sent, %d spent, %d excess, %d overspent)", want, sent, spent, balance.Excess, balance.Debt)
	}
	if balance.Debt > 0 {
		a.warnAttach(fmt.Sprintf("%d points were spent beyond the AP entitlement; future grants pay down that balance", balance.Debt))
	}
}

// maybeReportGoal sends the completion status once the quest that records the goal
// boss's death is done on the goal difficulty. Archipelago will not mark the slot
// finished on location checks alone — the client has to say so explicitly.
func (a *app) maybeReportGoal(ctx context.Context, st *save.State) {
	a.mu.Lock()
	goal, act := a.goalDifficulty, a.goalAct
	a.mu.Unlock()
	if goal < 0 || a.session.HasGoal() || !a.conn.Connected() {
		return
	}
	if goalReached(st, goal, act) {
		if err := a.conn.SendGoal(ctx); err != nil {
			logf("reporting goal failed: %v", err)
			return
		}
		logf("GOAL COMPLETE: %s defeated on %s", goalBossNames[act], difficultyName(goal))
	}
}

// goalReached reports whether the save records the goal boss's death.
func goalReached(st *save.State, difficulty, act int) bool {
	if act < 0 || act >= len(ids.GoalQuestIndex) {
		return false
	}
	for _, q := range st.CompletedQuests {
		if q.Difficulty == difficulty && q.Act == act && q.Index == ids.GoalQuestIndex[act] {
			return true
		}
	}
	return false
}

func (a *app) detachGame() {
	if a.gc == nil {
		return
	}
	a.gc.Close()
	a.gc = nil
}

func defaultStateDir() string {
	dir, err := os.UserConfigDir()
	if err != nil {
		return ".d2rr-ap"
	}
	return filepath.Join(dir, "d2rr-ap")
}

func defaultSaveDir(savepath string) string {
	home, err := os.UserHomeDir()
	if err != nil {
		return "."
	}
	return filepath.Join(home, "Saved Games", "Diablo II Resurrected", "mods", savepath)
}

func logf(format string, args ...any) {
	fmt.Printf("%s  %s\n", time.Now().Format("15:04:05"), fmt.Sprintf(format, args...))
}

func fatal(format string, args ...any) {
	fmt.Fprintf(os.Stderr, format+"\n", args...)
	os.Exit(1)
}

// areaLabel is the display name for a levels.txt area id, for the log only.
func areaLabel(levelID int) string {
	if i, ok := ids.AreaIndexForLevelID(levelID); ok {
		return ids.AreaLabels[i]
	}
	return fmt.Sprintf("area %d", levelID)
}
