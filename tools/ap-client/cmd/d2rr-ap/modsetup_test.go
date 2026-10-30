//go:build windows

package main

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/Dune172/d2r-skill-randomizer/tools/ap-client/internal/apc"
	"github.com/Dune172/d2r-skill-randomizer/tools/ap-client/internal/manifest"
)

func TestSaveDirDefaultsToTheModsFolder(t *testing.T) {
	expected := defaultSaveDir("ap_1234_pal")
	got, err := resolveSaveDir("", expected)
	if err != nil || got != expected {
		t.Fatalf("got %q %v, want %q", got, err, expected)
	}
	if !strings.HasSuffix(expected, filepath.Join("Diablo II Resurrected", "mods", "ap_1234_pal")) {
		t.Fatalf("default save folder %q", expected)
	}
}

func TestSaveDirFlagWinsWhenTheFolderExists(t *testing.T) {
	dir := t.TempDir()
	got, err := resolveSaveDir(dir, defaultSaveDir("ap_1234_pal"))
	if err != nil || !strings.EqualFold(got, dir) {
		t.Fatalf("an existing -save-dir must be used: got %q %v", got, err)
	}
}

func TestSaveDirFlagMustExist(t *testing.T) {
	dir := t.TempDir()
	if _, err := resolveSaveDir(filepath.Join(dir, "typo"), defaultSaveDir("x")); err == nil {
		t.Fatal("accepted a -save-dir that does not exist")
	}
	file := filepath.Join(dir, "Char.d2s")
	if err := os.WriteFile(file, nil, 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := resolveSaveDir(file, defaultSaveDir("x")); err == nil {
		t.Fatal("accepted a file as -save-dir")
	}
}

// testModZip is a mod zip holding only a valid manifest for seed 1234, Paladin.
func testModZip(t *testing.T) []byte {
	t.Helper()
	type slot struct {
		SlotID    string `json:"slotId"`
		SkillName string `json:"skillName"`
		SkillID   int    `json:"skillId"`
	}
	slots := make([]slot, 30)
	for i := range slots {
		slots[i] = slot{fmt.Sprintf("pal:S%02d", i), fmt.Sprintf("Skill%d", i), 100 + i}
	}
	raw, err := json.Marshal(map[string]any{
		"contractVersion": manifest.ContractVersion, "pipelineVersion": 1, "seed": 1234,
		"modName": "seed1234", "savepath": "ap_1234_pal", "characterClass": "pal",
		"classes": map[string]any{"pal": map[string]any{"slots": slots}},
		"tables": map[string]any{"stats": map[string]any{"keys": 368, "mail": 369},
			"mailIdle": 1, "mailAttuned": 256, "baseAttributes": 85},
	})
	if err != nil {
		t.Fatal(err)
	}
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	w, _ := zw.Create("seed1234/d2rr-ap-manifest.json")
	w.Write(raw)
	if err := zw.Close(); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

// A fetch that succeeded must not be repeated when a later setup step fails: each retry
// used to POST a full mod build to the site every 5 s.
func TestSetupRetryReusesTheFetchedMod(t *testing.T) {
	zipBytes := testModZip(t)
	var requests atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests.Add(1)
		w.Write(zipBytes)
	}))
	defer srv.Close()

	saveDir := filepath.Join(t.TempDir(), "saves")
	a := &app{
		baseURL: srv.URL, modOut: t.TempDir(), saveDirFlag: saveDir,
		session: apc.PendingSession(t.TempDir(), "Slot"), lastSeen: map[string]bool{},
	}
	slotData := map[string]any{"d2rr_seed": float64(1234), "character_class": "pal", "savepath": "ap_1234_pal"}

	// -save-dir does not exist yet, so adopting the manifest fails after the fetch.
	for i := 0; i < 3; i++ {
		if err := a.ensureMod(slotData); err == nil {
			t.Fatal("setup succeeded with a missing -save-dir")
		}
	}
	if n := requests.Load(); n != 1 {
		t.Fatalf("the mod was requested %d times, want 1", n)
	}
	if err := os.Mkdir(saveDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := a.ensureMod(slotData); err != nil {
		t.Fatal(err)
	}
	if n := requests.Load(); n != 1 || !a.setupOK || a.saveDir != saveDir {
		t.Fatalf("requests %d, setupOK %v, saveDir %q", n, a.setupOK, a.saveDir)
	}
	if _, err := os.Stat(filepath.Join(a.modOut, "seed1234.zip")); err != nil {
		t.Fatalf("the mod zip was not written: %v", err)
	}

	// A cached mod for a different room is not reused: with nothing adopted yet, a room
	// that wants another seed is fetched again.
	a.man, a.saveDir, a.setupOK = nil, "", false
	other := map[string]any{"d2rr_seed": float64(99), "character_class": "pal", "savepath": "ap_1234_pal"}
	a.ensureMod(other)
	if n := requests.Load(); n != 2 {
		t.Fatalf("a mod for another seed came from the cache (requests %d)", n)
	}
}

// A room that pools stat points asks for a mod whose Tonic restores them, even when its
// apworld predates "pooledStats" in mod_options.
func TestTheRoomsPooledStatsReachTheModRequest(t *testing.T) {
	var asked map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Options map[string]any `json:"options"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		asked = body.Options
		w.Write(testModZip(t))
	}))
	defer server.Close()
	a := &app{
		baseURL: server.URL, modOut: t.TempDir(), saveDirFlag: t.TempDir(),
		session: apc.PendingSession(t.TempDir(), "Slot"), lastSeen: map[string]bool{},
	}
	slotData := map[string]any{
		"d2rr_seed": float64(1234), "character_class": "pal", "savepath": "ap_1234_pal",
		"stat_points_pooled": true, "mod_options": map[string]any{"keyItems": true},
	}
	_ = a.ensureMod(slotData)
	if asked["pooledStats"] != true || asked["keyItems"] != true {
		t.Fatalf("the mod request carried %v", asked)
	}
	if _, ok := slotData["mod_options"].(map[string]any)["pooledStats"]; ok {
		t.Fatal("the room's own slot data must not be changed")
	}
}
