package setup

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"fmt"
	"github.com/swannysoft/d2rr-ap-client/internal/manifest"
	"os"
	"path/filepath"
	"testing"
)

func testManifest(t *testing.T) *manifest.Manifest {
	t.Helper()
	slots := []manifest.Slot{}
	for i := 0; i < 30; i++ {
		slots = append(slots, manifest.Slot{SlotID: fmt.Sprintf("pal:S%02d", i), SkillID: 100 + i, SkillName: fmt.Sprintf("Skill%d", i)})
	}
	raw, _ := json.Marshal(map[string]any{"contractVersion": 3, "pipelineVersion": 1, "seed": 1234, "modName": "seed1234", "savepath": "ap_1234_pal", "characterClass": "pal", "classes": map[string]any{"pal": map[string]any{"slots": slots}}, "tables": map[string]any{"stats": map[string]any{"keys": 368, "mail": 369}, "mailIdle": 1, "mailAttuned": 128, "baseAttributes": 85, "mail": []map[string]any{{"offer": 2, "item": "r01", "name": "El Rune"}}}})
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
	Install(root, testZip(t, m, ""), m)
	// Force reinstallation; traversal must be rejected before the existing dir is moved.
	os.WriteFile(filepath.Join(root, "mods", m.ModName, "d2rr-install-hashes.json"), []byte("bad"), 0600)
	for _, entry := range []string{"seed1234/../../outside.txt", "seed1234/.. /outside.txt", "other/file", "seed1234/C:/file", "seed1234/CON"} {
		if _, e := Install(root, testZip(t, m, entry), m); e == nil {
			t.Fatalf("accepted %q", entry)
		}
	}
	if _, e := os.Stat(filepath.Join(root, "mods", m.ModName)); e != nil {
		t.Fatal("bad archive removed existing installation")
	}
}
func TestVerifyExactProcessArguments(t *testing.T) {
	root := t.TempDir()
	m := testManifest(t)
	Install(root, testZip(t, m, ""), m)
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
