//go:build windows

package setup

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/Dune172/d2r-skill-randomizer/tools/ap-client/internal/manifest"
	"golang.org/x/sys/windows"
)

func testManifest(t *testing.T) *manifest.Manifest {
	t.Helper()
	slots := []manifest.Slot{}
	for i := 0; i < 30; i++ {
		slots = append(slots, manifest.Slot{SlotID: fmt.Sprintf("pal:S%02d", i), SkillID: 100 + i, SkillName: fmt.Sprintf("Skill%d", i)})
	}
	raw, _ := json.Marshal(map[string]any{"contractVersion": 3, "pipelineVersion": 1, "seed": 1234, "modName": "seed1234", "savepath": "ap_1234_pal", "characterClass": "pal", "classes": map[string]any{"pal": map[string]any{"slots": slots}}, "tables": map[string]any{"stats": map[string]any{"keys": 368, "mail": 369}, "mailIdle": 1, "mailAttuned": 256, "baseAttributes": 85, "mail": []map[string]any{{"offer": 2, "item": "r01", "name": "El Rune"}}}})
	m, e := manifest.Parse(raw)
	if e != nil {
		t.Fatal(e)
	}
	return m
}
func testZip(t *testing.T, m *manifest.Manifest, extra string) []byte {
	t.Helper()
	var b bytes.Buffer
	z := zip.NewWriter(&b)
	raw, _ := json.Marshal(m)
	entries := map[string][]byte{m.ModName + "/d2rr-ap-manifest.json": raw, m.ModName + "/" + m.ModName + ".mpq/modinfo.json": []byte(`{"name":"seed1234","savepath":"ap_1234_pal"}`)}
	if extra != "" {
		entries[extra] = []byte("outside")
	}
	for name, data := range entries {
		w, e := z.Create(name)
		if e != nil {
			t.Fatal(e)
		}
		w.Write(data)
	}
	z.Close()
	return b.Bytes()
}
func TestInstallVerifyRepairAndBackup(t *testing.T) {
	root := t.TempDir()
	m := testManifest(t)
	data := testZip(t, m, "")
	dir, e := Install(root, data, m)
	if e != nil {
		t.Fatal(e)
	}
	if e = VerifyInstalled(root, m); e != nil {
		t.Fatal(e)
	}
	if _, e = Install(root, data, m); e != nil {
		t.Fatal("idempotent install failed", e)
	}
	backups, _ := filepath.Glob(dir + ".backup-*")
	if len(backups) != 0 {
		t.Fatal("unchanged install was replaced")
	}
	file := filepath.Join(dir, m.ModName+".mpq", "modinfo.json")
	os.WriteFile(file, []byte("damaged"), 0600)
	if e = VerifyInstalled(root, m); e == nil {
		t.Fatal("accepted damaged installation")
	}
	if _, e = Install(root, data, m); e != nil {
		t.Fatal(e)
	}
	backups, _ = filepath.Glob(dir + ".backup-*")
	if len(backups) != 1 {
		t.Fatal("old installation was not retained")
	}
}
func TestUnsafeArchivesDoNotReplaceInstalledMod(t *testing.T) {
	root := t.TempDir()
	m := testManifest(t)
	if _, e := Install(root, testZip(t, m, ""), m); e != nil {
		t.Fatal(e)
	}
	// Force reinstallation; traversal must be rejected before the existing dir is moved.
	os.WriteFile(filepath.Join(root, "mods", m.ModName, "d2rr-install-hashes.json"), []byte("bad"), 0600)
	for _, entry := range []string{"seed1234/../../outside.txt", "seed1234/.. /outside.txt", "other/file", "seed1234/C:/file", "seed1234/CON"} {
		_, e := Install(root, testZip(t, m, entry), m)
		if e == nil {
			t.Fatalf("accepted %q", entry)
		}
		if msg := e.Error(); !strings.Contains(msg, "unsafe archive") && !strings.Contains(msg, "unexpected archive entry") && !strings.Contains(msg, "reserved Windows path") {
			t.Fatalf("%q rejected for the wrong reason: %v", entry, e)
		}
	}
	if _, e := os.Stat(filepath.Join(root, "mods", m.ModName)); e != nil {
		t.Fatal("bad archive removed existing installation")
	}
}

// A game folder reached through an 8.3 short name (as t.TempDir is on GitHub's
// runners, C:\Users\RUNNER~1) is a real folder, not a link.
func TestInstallThroughShortPath(t *testing.T) {
	long := t.TempDir()
	p, e := windows.UTF16PtrFromString(long)
	if e != nil {
		t.Fatal(e)
	}
	buf := make([]uint16, windows.MAX_LONG_PATH)
	n, e := windows.GetShortPathName(p, &buf[0], uint32(len(buf)))
	if e != nil || n == 0 {
		t.Skipf("no short path: %v", e)
	}
	short := windows.UTF16ToString(buf[:n])
	if strings.EqualFold(short, long) {
		t.Skip("8.3 names are disabled on this volume")
	}
	m := testManifest(t)
	if _, e = Install(short, testZip(t, m, ""), m); e != nil {
		t.Fatal(e)
	}
	if e = VerifyInstalled(short, m); e != nil {
		t.Fatal(e)
	}
}

func junction(t *testing.T, link, target string) {
	t.Helper()
	if out, e := exec.Command("cmd", "/c", "mklink", "/J", link, target).CombinedOutput(); e != nil {
		t.Skipf("cannot create junction: %v %s", e, out)
	}
}

// A game folder behind a junction (a library moved to another drive) is fine; a
// mods folder that is itself a junction is refused.
func TestJunctions(t *testing.T) {
	base := t.TempDir()
	m := testManifest(t)

	realGame := filepath.Join(base, "real-game")
	os.MkdirAll(realGame, 0755)
	linkedGame := filepath.Join(base, "linked-game")
	junction(t, linkedGame, realGame)
	if _, e := Install(linkedGame, testZip(t, m, ""), m); e != nil {
		t.Fatalf("install through a junctioned game folder: %v", e)
	}
	if _, e := os.Stat(filepath.Join(realGame, "mods", m.ModName, "d2rr-ap-manifest.json")); e != nil {
		t.Fatal("mod did not land in the real game folder")
	}

	game := filepath.Join(base, "game")
	elsewhere := filepath.Join(base, "elsewhere")
	os.MkdirAll(game, 0755)
	os.MkdirAll(elsewhere, 0755)
	junction(t, filepath.Join(game, "mods"), elsewhere)
	_, e := Install(game, testZip(t, m, ""), m)
	if e == nil || !strings.Contains(e.Error(), "junction") {
		t.Fatalf("accepted a mods folder that is a junction: %v", e)
	}
}

func TestVerifyExactProcessArguments(t *testing.T) {
	root := t.TempDir()
	m := testManifest(t)
	if _, e := Install(root, testZip(t, m, ""), m); e != nil {
		t.Fatal(e)
	}
	executable := filepath.Join(root, "D2R.exe")
	for _, args := range []string{` -mod seed999 -txt`, ` -mod seed1234 -txtExtra`, ` -mod seed1234 -mod seed1234 -txt`, ` -mod seed1234`, ` -txt -mod`} {
		if e := VerifyProcess(Process{ExecutablePath: executable, CommandLine: `"` + executable + `"` + args}, m); e == nil {
			t.Fatalf("accepted %s", args)
		}
	}
	if e := VerifyProcess(Process{ExecutablePath: executable, CommandLine: `"` + executable + `" -mod "seed1234" -txt`}, m); e != nil {
		t.Fatal(e)
	}
}

// Optional local artifact smoke test: the same extraction/verification path used by
// the client, against a real generated zip, installed only into a temporary folder.
func TestGeneratedArchive(t *testing.T) {
	path := os.Getenv("D2RR_TEST_MOD_ZIP")
	if path == "" {
		t.Skip("set D2RR_TEST_MOD_ZIP for real-mod installation test")
	}
	data, e := os.ReadFile(path)
	if e != nil {
		t.Fatal(e)
	}
	m, e := manifest.FromZip(data)
	if e != nil {
		t.Fatal(e)
	}
	root := t.TempDir()
	if _, e = Install(root, data, m); e != nil {
		t.Fatal(e)
	}
	if e = VerifyInstalled(root, m); e != nil {
		t.Fatal(e)
	}
}

// The site's mod downloads carry a launcher shortcut beside the mod folder: it is
// skipped, not installed, and not a reason to refuse the zip.
func TestALauncherShortcutBesideTheModIsSkipped(t *testing.T) {
	root := t.TempDir()
	m := testManifest(t)
	if _, e := Install(root, testZip(t, m, "D2R Randomizer 1234.lnk"), m); e != nil {
		t.Fatalf("a top-level shortcut must not block the install: %v", e)
	}
	if _, e := os.Stat(filepath.Join(root, "mods", "D2R Randomizer 1234.lnk")); !os.IsNotExist(e) {
		t.Fatal("the shortcut was installed")
	}
	for _, name := range []string{"notes.txt", "sub/D2R.lnk"} {
		if _, e := Install(t.TempDir(), testZip(t, m, name), m); e == nil {
			t.Fatalf("accepted %q outside the mod folder", name)
		}
	}
}
