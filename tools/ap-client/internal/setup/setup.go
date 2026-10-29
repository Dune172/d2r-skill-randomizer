// Package setup verifies the selected process and installs a matching offline mod.
package setup

import (
	"archive/zip"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strings"
	"syscall"
	"time"
	"unsafe"

	"github.com/swannysoft/d2rr-ap-client/internal/manifest"
	"golang.org/x/sys/windows"
)

type Process struct {
	ProcessId                   uint32
	ExecutablePath, CommandLine string
}

func Inspect(pid uint32) (Process, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "powershell.exe", "-NoProfile", "-NonInteractive", "-Command",
		fmt.Sprintf(`Get-CimInstance Win32_Process -Filter "ProcessId=%d" | Select-Object ProcessId,ExecutablePath,CommandLine | ConvertTo-Json -Compress`, pid))
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	out, err := cmd.Output()
	if err != nil {
		return Process{}, fmt.Errorf("cannot inspect process %d: %w", pid, err)
	}
	var p Process
	if err := json.Unmarshal(bytes.TrimPrefix(out, []byte{0xef, 0xbb, 0xbf}), &p); err != nil {
		return p, err
	}
	if p.ProcessId != pid || p.ExecutablePath == "" || p.CommandLine == "" {
		return p, fmt.Errorf("process identity is unreadable; check permissions")
	}
	return p, nil
}

func VerifyProcess(p Process, m *manifest.Manifest) error {
	if !strings.EqualFold(filepath.Base(p.ExecutablePath), "D2R.exe") {
		return fmt.Errorf("attached process is not D2R.exe")
	}
	args, err := windows.DecomposeCommandLine(p.CommandLine)
	if err != nil {
		return err
	}
	mod, txt, count := "", false, 0
	for i := 1; i < len(args); i++ {
		switch strings.ToLower(args[i]) {
		case "-mod":
			count++
			if i+1 >= len(args) {
				return fmt.Errorf("-mod has no value")
			}
			i++
			mod = args[i]
		case "-txt":
			txt = true
		}
	}
	if count != 1 || mod != m.ModName || !txt {
		return fmt.Errorf("launch D2R with -mod %s -txt; attached process uses a different or unreadable mod", m.ModName)
	}
	return VerifyInstalled(filepath.Dir(p.ExecutablePath), m)
}

func Detect(explicit string) (string, error) {
	if explicit != "" {
		root, err := filepath.Abs(explicit)
		if err != nil {
			return "", err
		}
		if _, err = os.Stat(filepath.Join(root, "D2R.exe")); err != nil {
			return "", fmt.Errorf("D2R.exe not found in %s", root)
		}
		return root, nil
	}
	candidates := []string{}
	for _, env := range []string{"ProgramFiles(x86)", "ProgramFiles"} {
		if root := os.Getenv(env); root != "" {
			candidates = append(candidates, filepath.Join(root, "Diablo II Resurrected"), filepath.Join(root, "Steam", "steamapps", "common", "Diablo II Resurrected"))
		}
	}
	for _, p := range candidates {
		if _, err := os.Stat(filepath.Join(p, "D2R.exe")); err == nil {
			return p, nil
		}
	}
	return "", fmt.Errorf("D2R installation not found; pass -game-dir with the folder containing D2R.exe")
}

func VerifyInstalled(root string, m *manifest.Manifest) error {
	dir := filepath.Join(root, "mods", m.ModName)
	installed, err := manifest.LoadFile(filepath.Join(dir, "d2rr-ap-manifest.json"))
	if err != nil {
		return fmt.Errorf("installed mod manifest: %w", err)
	}
	if !reflect.DeepEqual(installed, m) {
		return fmt.Errorf("installed mod differs from the room's manifest; reinstall the downloaded zip")
	}
	raw, err := os.ReadFile(filepath.Join(dir, m.ModName+".mpq", "modinfo.json"))
	if err != nil {
		return err
	}
	var info struct {
		Name     string `json:"name"`
		Savepath string `json:"savepath"`
	}
	if err = json.Unmarshal(raw, &info); err != nil {
		return err
	}
	if info.Name != m.ModName || info.Savepath != m.Savepath {
		return fmt.Errorf("installed modinfo does not match mod/save folder")
	}
	receipt, err := os.ReadFile(filepath.Join(dir, "d2rr-install-hashes.json"))
	if err != nil {
		return fmt.Errorf("mod has no installation receipt; run with -install to verify its files")
	}
	var hashes map[string]string
	if err = json.Unmarshal(receipt, &hashes); err != nil {
		return err
	}
	if len(hashes) < 2 {
		return fmt.Errorf("empty installation receipt")
	}
	for name, want := range hashes {
		dest, err := contained(dir, name)
		if err != nil {
			return err
		}
		f, err := os.Open(dest)
		if err != nil {
			return err
		}
		h := sha256.New()
		_, err = io.Copy(h, f)
		f.Close()
		if err != nil {
			return err
		}
		if hex.EncodeToString(h.Sum(nil)) != want {
			return fmt.Errorf("installed file changed: %s; reinstall the mod", name)
		}
	}
	return nil
}

func contained(root, name string) (string, error) {
	if strings.Contains(name, ":") || strings.Contains(name, `\`) || filepath.IsAbs(name) {
		return "", fmt.Errorf("unsafe archive path %q", name)
	}
	for _, part := range strings.Split(strings.TrimSuffix(name, "/"), "/") {
		if part == "" || part == "." || part == ".." || strings.TrimRight(part, " .") != part {
			return "", fmt.Errorf("unsafe archive component %q", part)
		}
		base := strings.ToUpper(strings.SplitN(part, ".", 2)[0])
		if base == "CON" || base == "PRN" || base == "AUX" || base == "NUL" || len(base) == 4 && (strings.HasPrefix(base, "COM") || strings.HasPrefix(base, "LPT")) && base[3] >= '1' && base[3] <= '9' {
			return "", fmt.Errorf("reserved Windows path %q", part)
		}
	}
	clean := filepath.Clean(filepath.FromSlash(name))
	if clean == ".." || strings.HasPrefix(clean, ".."+string(os.PathSeparator)) || clean == "." {
		return "", fmt.Errorf("unsafe archive path %q", name)
	}
	return filepath.Join(root, clean), nil
}

// Install extracts into a fresh directory, verifies every entry, then swaps directories.
// Previous installations are retained as backups. No save files are touched.
func Install(root string, data []byte, m *manifest.Manifest) (string, error) {
	if err := m.MatchRoom(m.Seed, m.CharacterClass, m.Savepath); err != nil {
		return "", err
	}
	if err := VerifyInstalled(root, m); err == nil {
		return filepath.Join(root, "mods", m.ModName), nil
	}
	mods, err := modsDir(root)
	if err != nil {
		return "", err
	}
	stage, err := os.MkdirTemp(mods, ".d2rr-install-")
	if err != nil {
		return "", err
	}
	// stage is created under the verified absolute mods directory.
	defer os.RemoveAll(stage)
	zr, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return "", err
	}
	seen := map[string]bool{}
	hashes := map[string]string{}
	var total uint64
	for _, entry := range zr.File {
		if !strings.HasPrefix(entry.Name, m.ModName+"/") || entry.Mode()&os.ModeSymlink != 0 {
			return "", fmt.Errorf("unexpected archive entry %q", entry.Name)
		}
		dest, err := contained(stage, entry.Name)
		if err != nil {
			return "", err
		}
		key := strings.ToLower(filepath.Clean(dest))
		if seen[key] {
			return "", fmt.Errorf("duplicate archive entry")
		}
		seen[key] = true
		if entry.FileInfo().IsDir() {
			if err = os.MkdirAll(dest, 0755); err != nil {
				return "", err
			}
			continue
		}
		total += entry.UncompressedSize64
		if total > 512<<20 || entry.UncompressedSize64 > 128<<20 {
			return "", fmt.Errorf("mod archive exceeds size limit")
		}
		if err = os.MkdirAll(filepath.Dir(dest), 0755); err != nil {
			return "", err
		}
		r, err := entry.Open()
		if err != nil {
			return "", err
		}
		f, err := os.OpenFile(dest, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0644)
		if err != nil {
			r.Close()
			return "", err
		}
		h := sha256.New()
		_, copyErr := io.Copy(io.MultiWriter(f, h), io.LimitReader(r, 128<<20+1))
		closeErr := f.Close()
		r.Close()
		if copyErr != nil {
			return "", copyErr
		}
		if closeErr != nil {
			return "", closeErr
		}
		hashes[strings.TrimPrefix(entry.Name, m.ModName+"/")] = hex.EncodeToString(h.Sum(nil))
	}
	receipt, _ := json.MarshalIndent(hashes, "", "  ")
	staged := filepath.Join(stage, m.ModName)
	if err = os.WriteFile(filepath.Join(staged, "d2rr-install-hashes.json"), receipt, 0644); err != nil {
		return "", err
	}
	// Verify in the same directory topology used by an installed mod.
	stageRoot := filepath.Join(stage, "verify")
	if err = os.MkdirAll(filepath.Join(stageRoot, "mods"), 0755); err != nil {
		return "", err
	}
	verified := filepath.Join(stageRoot, "mods", m.ModName)
	if err = os.Rename(staged, verified); err != nil {
		return "", err
	}
	if err = VerifyInstalled(stageRoot, m); err != nil {
		return "", err
	}
	dest := filepath.Join(mods, m.ModName)
	backup := ""
	if info, e := os.Lstat(dest); e == nil {
		if !info.IsDir() || info.Mode()&(os.ModeSymlink|os.ModeIrregular) != 0 {
			return "", fmt.Errorf("existing mod is not a regular directory")
		}
		resolved, e := finalPath(dest)
		if e != nil || !strings.EqualFold(resolved, dest) {
			return "", fmt.Errorf("existing mod resolves outside its expected path")
		}
		backup = dest + ".backup-" + time.Now().Format("20060102-150405.000000000")
		if err = os.Rename(dest, backup); err != nil {
			return "", err
		}
	} else if !os.IsNotExist(e) {
		return "", e
	}
	if err = os.Rename(verified, dest); err != nil {
		if backup != "" {
			if rerr := os.Rename(backup, dest); rerr != nil {
				return "", fmt.Errorf("%w; the previous installation is kept at %s (restoring it failed: %v)", err, backup, rerr)
			}
		}
		return "", err
	}
	return dest, nil
}

// modsDir creates root\mods and returns its real path. The game root is resolved
// first, which expands 8.3 short names (C:\Users\RUNNER~1) and allows the install
// itself to sit behind a junction, such as a game library moved to another drive.
// Only a mods folder that is itself a junction or symlink is refused, because
// installing through it would write somewhere the game root does not contain.
func modsDir(root string) (string, error) {
	abs, err := filepath.Abs(root)
	if err != nil {
		return "", err
	}
	if err = os.MkdirAll(filepath.Join(abs, "mods"), 0755); err != nil {
		return "", err
	}
	realRoot, err := finalPath(abs)
	if err != nil {
		return "", err
	}
	mods := filepath.Join(realRoot, "mods")
	info, err := os.Lstat(mods)
	if err != nil {
		return "", err
	}
	real, err := finalPath(mods)
	if err != nil {
		return "", err
	}
	if !info.IsDir() || info.Mode()&(os.ModeSymlink|os.ModeIrregular) != 0 || !strings.EqualFold(real, mods) {
		return "", fmt.Errorf("mods directory uses a junction or symlink; choose its real installation path")
	}
	return mods, nil
}

// finalPath returns the path Windows itself resolves p to, with junctions,
// symlinks and 8.3 short names expanded. filepath.EvalSymlinks cannot be used:
// since Go 1.23 it does not follow directory junctions and fails on any path
// that runs through one.
func finalPath(p string) (string, error) {
	name, err := windows.UTF16PtrFromString(p)
	if err != nil {
		return "", err
	}
	h, err := windows.CreateFile(name, 0, windows.FILE_SHARE_READ|windows.FILE_SHARE_WRITE|windows.FILE_SHARE_DELETE,
		nil, windows.OPEN_EXISTING, windows.FILE_FLAG_BACKUP_SEMANTICS, 0)
	if err != nil {
		return "", &os.PathError{Op: "open", Path: p, Err: err}
	}
	defer windows.CloseHandle(h)
	buf := make([]uint16, windows.MAX_LONG_PATH)
	// FILE_NAME_NORMALIZED | VOLUME_NAME_DOS; both are 0 and x/sys/windows does not name them.
	const normalizedDOSPath = 0
	n, err := windows.GetFinalPathNameByHandle(h, &buf[0], uint32(len(buf)), normalizedDOSPath)
	if err != nil {
		return "", &os.PathError{Op: "resolve", Path: p, Err: err}
	}
	s := windows.UTF16ToString(buf[:n])
	if strings.HasPrefix(s, `\\?\UNC\`) {
		return `\\` + s[len(`\\?\UNC\`):], nil
	}
	return strings.TrimPrefix(s, `\\?\`), nil
}

func Launch(root string, m *manifest.Manifest) error {
	if err := VerifyInstalled(root, m); err != nil {
		return err
	}
	cmd := exec.Command(filepath.Join(root, "D2R.exe"), "-mod", m.ModName, "-txt")
	cmd.Dir = root
	// This process is the game the user explicitly requested to launch, not a helper.
	if err := cmd.Start(); err != nil {
		return err
	}
	return cmd.Process.Release()
}

func ExecutableHash(path string) (string, error) {
	f, e := os.Open(path)
	if e != nil {
		return "", e
	}
	defer f.Close()
	h := sha256.New()
	if _, e = io.Copy(h, f); e != nil {
		return "", e
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

func GameRunning() bool {
	h, e := windows.CreateToolhelp32Snapshot(windows.TH32CS_SNAPPROCESS, 0)
	if e != nil {
		return true
	}
	defer windows.CloseHandle(h)
	var entry windows.ProcessEntry32
	entry.Size = uint32(unsafe.Sizeof(entry))
	e = windows.Process32First(h, &entry)
	for e == nil {
		if strings.EqualFold(windows.UTF16ToString(entry.ExeFile[:]), "D2R.exe") {
			return true
		}
		e = windows.Process32Next(h, &entry)
	}
	return false
}
