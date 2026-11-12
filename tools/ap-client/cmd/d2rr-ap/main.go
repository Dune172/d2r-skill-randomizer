//go:build windows

// Command d2rr-ap connects an offline D2RR character to Archipelago.
//
// Checks come from the character's save file and from the running game. Everything the
// multiworld sends is granted by changing the value of a stat the game already holds.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"

	"github.com/Dune172/d2r-skill-randomizer/tools/ap-client/internal/apc"
	"github.com/Dune172/d2r-skill-randomizer/tools/ap-client/internal/ids"
	"github.com/Dune172/d2r-skill-randomizer/tools/ap-client/internal/manifest"
)

func main() {
	defer crashGuard()
	if len(os.Args) > 1 {
		switch os.Args[1] {
		case "doctor":
			os.Exit(doctor(os.Args[2:]))
		case "probe":
			os.Exit(probe(os.Args[2:]))
		case "saves":
			os.Exit(saves(os.Args[2:]))
		case "version":
			os.Exit(version())
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
		character  = flag.String("character", "", "bind this slot to this character (default: the one you load)")
		gameDir    = flag.String("game-dir", "", "D2R installation folder (detected when omitted)")
		install    = flag.Bool("install", false, "install and verify the matching mod automatically")
		launch     = flag.Bool("launch", false, "install the mod and launch D2R")
		statusFile = flag.String("status-file", "", "write a diagnostic JSON status snapshot to this path")
		dryRun     = flag.Bool("dry-run", false, "do everything except write to the game")
		diff       = flag.Int("difficulty", -1,
			"current difficulty for live checks: 0 normal, 1 nightmare, 2 hell; -1 uses /difficulty, calibrated memory or unambiguous saves")
	)
	flag.Usage = usage
	flag.Parse()

	if *diff < -1 || *diff > 2 {
		fatal("-difficulty must be -1, 0, 1, or 2")
	}
	if path, err := openLogFile(*stateDir); err == nil {
		logf("log file: %s", path)
	} else {
		logf("no log file (%v); this window is the only record", err)
	}

	// Without -slot, which is how a double-click starts it (and "d2rr-ap -difficulty 1"):
	// ask for the room instead of failing, and play as if -launch had been given. A room
	// that refuses the name or password asks again rather than closing the window.
	interactive := *slot == ""
	if interactive {
		pauseOnExit = true
	}
	var refused *roomChoice
	for {
		cfg := playConfig{
			host: *host, port: *port, slot: *slot, password: *password,
			modOut: *modOut, manPath: *manPath, baseURL: *baseURL, stateDir: *stateDir,
			saveDir: *saveDir, character: *character, gameDir: *gameDir,
			install: *install, launch: *launch, statusFile: *statusFile, dryRun: *dryRun, diff: *diff,
		}
		if interactive {
			choice, err := askRoom(*stateDir, refused)
			if err != nil {
				fatal("%v", err)
			}
			cfg.host, cfg.port, cfg.slot, cfg.password = choice.Host, choice.Port, choice.Slot, choice.password
			cfg.gameDir = choice.GameDir
			cfg.launch = true
			// Not the folder the app was double-clicked in (usually Downloads): the mod
			// zip is about 50 MB and only needed until it is installed.
			cfg.modOut = filepath.Join(*stateDir, "mods")
			removeLeftoverZips(cfg.modOut)
			cfg.remember = &choice
		}
		if cfg.slot == "" {
			fatal("-slot is required")
		}

		err := play(cfg)
		var no *apc.RefusedError
		if !errors.As(err, &no) {
			return
		}
		logf("The room refused to connect:")
		for _, line := range strings.Split(no.Explain(cfg.slot), "\n") {
			logf("  %s", line)
		}
		if !interactive {
			os.Exit(1)
		}
		fmt.Println()
		refused = cfg.remember
	}
}

// playConfig is one attempt to play a room: the flags, or the answers to askRoom.
type playConfig struct {
	host, slot, password                        string
	port                                        int
	modOut, manPath, baseURL, stateDir, saveDir string
	character, gameDir, statusFile              string
	install, launch, dryRun                     bool
	diff                                        int
	// remember is saved as the last room once the room accepts it (interactive only).
	remember *roomChoice
}

// play connects to the room and runs until the window is closed, or returns the
// room's refusal.
func play(cfg playConfig) error {
	// Echo the effective configuration before anything else runs.
	//
	// Checks come from the save file and grants come from memory — two independent
	// paths. So the client can look completely healthy (connected, checks flowing) while
	// granting nothing, and every flag that causes that is invisible once the log starts
	// scrolling. -dry-run in particular silently disables grants and nothing else.
	logf("server %s:%d  slot %q  mod source %s", cfg.host, cfg.port, cfg.slot, cfg.baseURL)
	if cfg.dryRun {
		logf("DRY RUN: checks will be sent but nothing will ever be granted")
	}
	if cfg.diff >= 0 {
		logf("difficulty pinned to %s for area checks", difficultyName(cfg.diff))
	}

	// The mod is fetched AFTER connecting, because the seed lives in the room's
	// slot_data — the apworld picks it at generation time and the player has no way to
	// know it otherwise. -manifest short-circuits this for offline testing.
	var man *manifest.Manifest
	if cfg.manPath != "" {
		m, err := manifest.LoadFile(cfg.manPath)
		if err != nil {
			fatal("loading manifest: %v", err)
		}
		man = m
		logf("loaded manifest from %s", cfg.manPath)
	}

	// --- session + connection -----------------------------------------------
	session := apc.PendingSession(cfg.stateDir, cfg.slot)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	app := &app{
		man:                man,
		session:            session,
		dryRun:             cfg.dryRun,
		lastSeen:           map[string]bool{},
		goalDifficulty:     -1,
		goalAct:            len(ids.GoalQuestIndex) - 1,
		difficultyOverride: cfg.diff,
		difficultyFlag:     cfg.diff,
		baseURL:            cfg.baseURL,
		modOut:             cfg.modOut,
		saveDirFlag:        cfg.saveDir,
		characterFlag:      cfg.character, gameDir: cfg.gameDir, installMod: cfg.install || cfg.launch, launchGame: cfg.launch,
		localManifest: cfg.manPath, stateDir: cfg.stateDir, statusFile: cfg.statusFile,
		commands:     make(chan consoleCommand, 4),
		messagePrefs: loadMessagePrefs(cfg.stateDir),
	}
	if man != nil {
		if err := app.useManifest(man); err != nil {
			logf("ERROR: %v", err)
		}
	}

	var conn *apc.Conn
	conn = apc.NewConn(cfg.host, cfg.port, cfg.slot, cfg.password, session, apc.Handler{
		OnConnected: func(slotData map[string]any, _ []int64) {
			logf("connected as %q (%d locations already checked)", cfg.slot, len(session.AllChecks()))
			if cfg.remember != nil {
				rememberRoom(cfg.stateDir, *cfg.remember)
			}
			if app.applySlotData(slotData) {
				conn.EnableDeathLink()
				logf("DeathLink is on")
			}
			app.recomputeDesired()
			// The poll loop reads this room's /difficulty choice now that the session is bound.
			select {
			case app.commands <- consoleCommand{name: "connected"}:
			default:
			}
		},
		OnDeathLink: func(source, cause string) {
			if cause == "" {
				cause = source + " died"
			}
			logf("DeathLink: %s", cause)
			app.queueDeath()
		},
		OnItems: func(s *apc.Session) {
			app.recomputeDesired()
		},
		OnPrint:   func(text string) { logf("%s", strings.TrimSpace(text)) },
		OnMessage: app.addMessage,
	})
	app.conn = conn

	refusal := make(chan error, 1)
	goSafe(func() {
		if err := conn.Run(ctx); err != nil {
			refusal <- err
			cancel()
		}
	})
	goSafe(func() { chat(ctx, conn, app.commands) })

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, os.Interrupt, syscall.SIGTERM)
	defer signal.Stop(sig)
	goSafe(func() {
		select {
		case <-sig:
			logf("shutting down")
			cancel()
		case <-ctx.Done():
		}
	})

	app.run(ctx)
	select {
	case err := <-refusal:
		return err
	default:
		return nil
	}
}

func usage() {
	out := flag.CommandLine.Output()
	fmt.Fprintf(out, `Usage:
  d2rr-ap                          ask for the room and your name, then install the
                                   mod, start the game and connect (what a double-click does)
  d2rr-ap -slot <name> [flags]     connect a character to an Archipelago room

Subcommands:
  d2rr-ap doctor [flags]           check the install, the mod and the loaded character (read-only)
  d2rr-ap saves <folder|.d2s>      list the checks a save file holds (read-only)
  d2rr-ap version                  print the build and the contract versions
  d2rr-ap probe [flags]            playtest tool: list or overwrite the loaded
                                   character's stats; not needed to play

While connected, type /help in the window for the app's own commands.

Run "d2rr-ap <subcommand> -h" for a subcommand's flags.

Flags:
`)
	flag.PrintDefaults()
}

// chat forwards typed lines to the room, so "!hint" and the other server commands work
// from this window like any Archipelago client. The app's own commands (/difficulty,
// /help) go to the poll loop instead.
func chat(ctx context.Context, conn *apc.Conn, commands chan<- consoleCommand) {
	for {
		line, ok := readLineCtx(ctx)
		if !ok {
			return
		}
		text := strings.TrimSpace(line)
		if text == "" {
			continue
		}
		if cmd, ok := parseConsoleCommand(text); ok {
			select {
			case commands <- cmd:
			case <-ctx.Done():
				return
			}
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

func defaultStateDir() string {
	dir, err := os.UserConfigDir()
	if err != nil {
		return ".d2rr-ap"
	}
	return filepath.Join(dir, "d2rr-ap")
}
