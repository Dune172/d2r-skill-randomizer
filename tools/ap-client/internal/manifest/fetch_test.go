package manifest

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// modZip builds a zip from name -> contents.
func modZip(t *testing.T, files map[string][]byte) []byte {
	t.Helper()
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	for name, data := range files {
		w, err := zw.Create(name)
		if err != nil {
			t.Fatal(err)
		}
		w.Write(data)
	}
	if err := zw.Close(); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func validJSON(t *testing.T) []byte {
	t.Helper()
	raw, err := json.Marshal(valid(t))
	if err != nil {
		t.Fatal(err)
	}
	return raw
}

func TestFetchPostsTheRoomAndReturnsTheZipAndManifest(t *testing.T) {
	zipBytes := modZip(t, map[string][]byte{
		"seed1234/d2rr-ap-manifest.json":    validJSON(t),
		"seed1234/seed1234.mpq/modinfo.json": []byte(`{}`),
	})
	var got wireRequest
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/api/archipelago/mod" {
			t.Errorf("%s %s", r.Method, r.URL.Path)
		}
		if ct := r.Header.Get("Content-Type"); ct != "application/json" {
			t.Errorf("content type %q", ct)
		}
		if err := json.NewDecoder(r.Body).Decode(&got); err != nil {
			t.Error(err)
		}
		w.Write(zipBytes)
	}))
	defer srv.Close()

	data, m, err := Fetch(FetchRequest{BaseURL: srv.URL + "/", Seed: 1234, CharacterClass: "pal",
		Savepath: "ap_1234_pal", Options: map[string]any{"horadric_keys": float64(1)}})
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(data, zipBytes) || m.ModName != "seed1234" || m.Seed != 1234 {
		t.Fatalf("got %d bytes, manifest %+v", len(data), m)
	}
	if got.Seed != 1234 || got.CharacterClass != "pal" || got.Savepath != "ap_1234_pal" ||
		got.ContractVersion != ContractVersion || got.Options["horadric_keys"] != float64(1) {
		t.Fatalf("request %+v", got)
	}
}

func TestFetchExplainsAFailedRequest(t *testing.T) {
	for _, tc := range []struct {
		name, body, want string
	}{
		{"html page", "<!DOCTYPE html><html>" + strings.Repeat("<meta>", 5000), "not deployed"},
		{"json error", `{"error":"rate limited"}`, "rate limited"},
		{"long error", strings.Repeat("x", 1000), "(truncated)"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(http.StatusTooManyRequests)
				w.Write([]byte(tc.body))
			}))
			defer srv.Close()
			_, _, err := Fetch(FetchRequest{BaseURL: srv.URL, Seed: 1, CharacterClass: "pal", Savepath: "x"})
			if err == nil || !strings.Contains(err.Error(), "429") || !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("error %v", err)
			}
			if len(err.Error()) > 400 {
				t.Fatalf("error is %d characters long", len(err.Error()))
			}
		})
	}
}

func TestFetchRejectsAZipWithoutAManifest(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write(modZip(t, map[string][]byte{"seed1234/readme.txt": nil}))
	}))
	defer srv.Close()
	if _, _, err := Fetch(FetchRequest{BaseURL: srv.URL, Seed: 1234, CharacterClass: "pal", Savepath: "x"}); err == nil {
		t.Fatal("accepted a zip with no manifest")
	}
}

func TestFromZipReadsOnlyTheModsOwnManifest(t *testing.T) {
	manifestJSON := validJSON(t)
	for _, tc := range []struct {
		name  string
		files map[string][]byte
		ok    bool
	}{
		{"expected path", map[string][]byte{"seed1234/d2rr-ap-manifest.json": manifestJSON}, true},
		{"nested deeper", map[string][]byte{"seed1234/data/d2rr-ap-manifest.json": manifestJSON}, false},
		{"at the root", map[string][]byte{"d2rr-ap-manifest.json": manifestJSON}, false},
		{"suffix only", map[string][]byte{"seed1234/evil-d2rr-ap-manifest.json": manifestJSON}, false},
		{"other mod's folder", map[string][]byte{"other/d2rr-ap-manifest.json": manifestJSON}, false},
		{"two manifests", map[string][]byte{
			"seed1234/d2rr-ap-manifest.json": manifestJSON,
			"other/d2rr-ap-manifest.json":    manifestJSON,
		}, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			m, err := FromZip(modZip(t, tc.files))
			if tc.ok && (err != nil || m.ModName != "seed1234") {
				t.Fatalf("rejected: %v", err)
			}
			if !tc.ok && err == nil {
				t.Fatal("accepted")
			}
		})
	}
}

func TestReadLimitedFailsRatherThanTruncates(t *testing.T) {
	if raw, err := readLimited(strings.NewReader("12345"), 5); err != nil || string(raw) != "12345" {
		t.Fatalf("at the limit: %q %v", raw, err)
	}
	if _, err := readLimited(strings.NewReader("123456"), 5); err == nil {
		t.Fatal("one byte over the limit was accepted")
	}
}
