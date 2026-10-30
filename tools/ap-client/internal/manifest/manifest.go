// Package manifest loads the apMode manifest that D2RR emits inside the mod zip.
//
// The manifest identifies the mod and its class skill rows for point accounting.
package manifest

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

// ContractVersion is the manifest shape this client understands. The server rejects a
// mismatch rather than serving something we would misread.
const ContractVersion = 5

type Slot struct {
	SlotID    string `json:"slotId"`
	SkillName string `json:"skillName"`
	SkillID   int    `json:"skillId"`
	Tab       int    `json:"tab"`
	Row       int    `json:"row"`
	Col       int    `json:"col"`
}

type Manifest struct {
	ContractVersion int    `json:"contractVersion"`
	PipelineVersion int    `json:"pipelineVersion"`
	Seed            int    `json:"seed"`
	ModName         string `json:"modName"`
	Savepath        string `json:"savepath"`
	CharacterClass  string `json:"characterClass"`
	Classes         map[string]struct {
		Slots []Slot `json:"slots"`
	} `json:"classes"`
	Tables Tables `json:"tables"`
}

// Tables describes what the mod added so the client can turn stats into things.
type Tables struct {
	// Stats are the itemstatcost ids of the custom stats. Keys stores the key count plus
	// one, so it is never zero (the game drops a zero stat).
	Stats struct {
		Keys int `json:"keys"`
	} `json:"stats"`
	// KeyGates is present only when the quest recipes are locked.
	KeyGates *struct {
		HoradricStaff int `json:"horadricStaff"`
		KhalimsWill   int `json:"khalimsWill"`
	} `json:"keyGates,omitempty"`
	// BaseAttributes is the class's starting strength+dexterity+energy+vitality.
	BaseAttributes int `json:"baseAttributes"`
	// MessageBox names the text box the mod adds to the chat panel, where the client
	// shows the items sent to and from this slot.
	MessageBox string `json:"messageBox"`
}

// Slots returns the AP class's 30 slots, ordered S00..S29.
func (m *Manifest) Slots() ([]Slot, error) {
	entry, ok := m.Classes[m.CharacterClass]
	if !ok {
		return nil, fmt.Errorf("manifest has no slots for class %q", m.CharacterClass)
	}
	if len(entry.Slots) != 30 {
		return nil, fmt.Errorf("class %s has %d slots, expected 30", m.CharacterClass, len(entry.Slots))
	}
	return entry.Slots, nil
}

// ClassSkillIDs returns the skills.txt row index of each of the class's 30 skills.
//
// These are the ids the game uses in memory, so they are what separates the character's
// own hard points from innate and item-granted entries in the skill list.
func (m *Manifest) ClassSkillIDs() (map[int]bool, error) {
	slots, err := m.Slots()
	if err != nil {
		return nil, err
	}
	ids := make(map[int]bool, len(slots))
	for i, sl := range slots {
		// Match on the id rather than trusting position.
		if sl.SlotID != fmt.Sprintf("%s:S%02d", m.CharacterClass, i) {
			return nil, fmt.Errorf("manifest slot %d is %q", i, sl.SlotID)
		}
		if sl.SkillID < 0 || sl.SkillID > 65535 || ids[sl.SkillID] {
			return nil, fmt.Errorf("missing or duplicate skill row for slot %d", i)
		}
		ids[sl.SkillID] = true
	}
	return ids, nil
}

func validate(m *Manifest) error {
	if m.ContractVersion != ContractVersion {
		return fmt.Errorf("manifest contract version %d, this client speaks %d",
			m.ContractVersion, ContractVersion)
	}
	safe := regexp.MustCompile(`^[A-Za-z0-9_-]+$`)
	if m.Seed < 1 || m.PipelineVersion < 1 || !safe.MatchString(m.ModName) || !safe.MatchString(m.Savepath) || len(m.Savepath) > 40 {
		return fmt.Errorf("manifest has invalid seed, pipeline, mod name or save folder")
	}
	if !strings.Contains("|ama|sor|nec|pal|bar|dru|ass|war|", "|"+m.CharacterClass+"|") {
		return fmt.Errorf("invalid manifest class")
	}
	slots, err := m.Slots()
	if err != nil {
		return err
	}
	if _, err := m.ClassSkillIDs(); err != nil {
		return err
	}
	names := map[string]bool{}
	for _, sl := range slots {
		if sl.SkillName == "" || names[sl.SkillName] {
			return fmt.Errorf("missing or duplicate skill name")
		}
		names[sl.SkillName] = true
	}
	return validateTables(&m.Tables)
}

// validateTables refuses tables the client could misread.
func validateTables(t *Tables) error {
	if t.Stats.Keys < 16 || t.Stats.Keys > 510 {
		return fmt.Errorf("manifest custom stat id is invalid")
	}
	if t.BaseAttributes < 1 {
		return fmt.Errorf("manifest base attributes are invalid")
	}
	if t.MessageBox != "" && !regexp.MustCompile(`^[A-Za-z0-9_]+$`).MatchString(t.MessageBox) {
		return fmt.Errorf("manifest message box name is invalid")
	}
	return nil
}

// Parse reads a manifest from raw JSON.
func Parse(data []byte) (*Manifest, error) {
	var m Manifest
	if err := json.Unmarshal(data, &m); err != nil {
		return nil, fmt.Errorf("parsing manifest: %w", err)
	}
	if err := validate(&m); err != nil {
		return nil, err
	}
	return &m, nil
}

// Size limits for what the client reads. A mod zip is a few MB; the caps only stop a
// broken or hostile server from making the client allocate without bound.
const (
	maxModZipBytes   = 256 << 20
	maxManifestBytes = 4 << 20
	maxErrorBytes    = 64 << 10
)

// manifestPath is where the site puts the manifest: <modName>/d2rr-ap-manifest.json.
var manifestPath = regexp.MustCompile(`^([A-Za-z0-9_-]+)/d2rr-ap-manifest\.json$`)

// FromZip extracts the manifest from a mod zip in memory.
//
// Only <modName>/d2rr-ap-manifest.json counts, and only for the mod the manifest names,
// so a file of the same name deeper in the zip cannot stand in for it.
func FromZip(data []byte) (*Manifest, error) {
	zr, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return nil, fmt.Errorf("reading mod zip: %w", err)
	}
	var found *zip.File
	var folder string
	for _, f := range zr.File {
		m := manifestPath.FindStringSubmatch(f.Name)
		if m == nil {
			continue
		}
		if found != nil {
			return nil, fmt.Errorf("the mod zip has more than one d2rr-ap-manifest.json")
		}
		found, folder = f, m[1]
	}
	if found == nil {
		return nil, fmt.Errorf("no <mod>/d2rr-ap-manifest.json in the mod zip")
	}
	if found.UncompressedSize64 > maxManifestBytes {
		return nil, fmt.Errorf("d2rr-ap-manifest.json is too large (%d bytes)", found.UncompressedSize64)
	}
	rc, err := found.Open()
	if err != nil {
		return nil, err
	}
	defer rc.Close()
	raw, err := readLimited(rc, maxManifestBytes)
	if err != nil {
		return nil, fmt.Errorf("reading d2rr-ap-manifest.json: %w", err)
	}
	m, err := Parse(raw)
	if err != nil {
		return nil, err
	}
	if m.ModName != folder {
		return nil, fmt.Errorf("the manifest names mod %q but sits in folder %q", m.ModName, folder)
	}
	return m, nil
}

// readLimited reads all of r, failing rather than truncating past max bytes.
func readLimited(r io.Reader, max int64) ([]byte, error) {
	raw, err := io.ReadAll(io.LimitReader(r, max+1))
	if err != nil {
		return nil, err
	}
	if int64(len(raw)) > max {
		return nil, fmt.Errorf("more than %d bytes", max)
	}
	return raw, nil
}

// LoadFile reads a manifest from a .json file or from a mod .zip.
func LoadFile(path string) (*Manifest, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	if strings.EqualFold(filepath.Ext(path), ".zip") {
		return FromZip(data)
	}
	return Parse(data)
}

// FetchRequest asks d2rrandomizer.com to build an apMode mod.
type FetchRequest struct {
	BaseURL        string
	Seed           int
	CharacterClass string
	Savepath       string
	// Options is the room's mod_options, passed through to the endpoint untouched.
	Options map[string]any
}

type wireRequest struct {
	Seed            int            `json:"seed"`
	ContractVersion int            `json:"contractVersion"`
	CharacterClass  string         `json:"characterClass"`
	Savepath        string         `json:"savepath"`
	Options         map[string]any `json:"options,omitempty"`
}

// Fetch downloads the mod zip and returns it together with its embedded manifest.
//
// Returns the zip bytes as well as the manifest because the player still has to install
// the mod; handing back only the manifest would describe a mod that does not exist on
// their disk.
func Fetch(req FetchRequest) (zipBytes []byte, m *Manifest, err error) {
	body, err := json.Marshal(wireRequest{
		Seed:            req.Seed,
		ContractVersion: ContractVersion,
		CharacterClass:  req.CharacterClass,
		Savepath:        req.Savepath,
		Options:         req.Options,
	})
	if err != nil {
		return nil, nil, err
	}

	base := strings.TrimSuffix(req.BaseURL, "/")
	if base == "" {
		base = "https://d2rrandomizer.com"
	}
	// Generation is a few seconds cold, and the server serialises it behind a queue.
	client := &http.Client{Timeout: 120 * time.Second}
	resp, err := client.Post(base+"/api/archipelago/mod", "application/json", bytes.NewReader(body))
	if err != nil {
		return nil, nil, fmt.Errorf("requesting mod: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		payload, _ := io.ReadAll(io.LimitReader(resp.Body, maxErrorBytes))
		return nil, nil, fmt.Errorf("mod request failed (%d): %s", resp.StatusCode, errorBody(payload))
	}
	payload, err := readLimited(resp.Body, maxModZipBytes)
	if err != nil {
		return nil, nil, fmt.Errorf("reading the mod: %w", err)
	}

	man, err := FromZip(payload)
	if err != nil {
		return nil, nil, err
	}
	return payload, man, nil
}

// errorBody turns a failed response into one readable line.
//
// A 404 from the D2RR site is a full Next.js HTML page — roughly 20 KB of markup that
// buries the actual problem under a screenful of <meta> tags, repeated every retry. The
// useful signal in that case is simply that HTML came back where JSON was expected,
// which almost always means the endpoint is not deployed on the host being asked.
func errorBody(payload []byte) string {
	body := strings.TrimSpace(string(payload))
	if strings.HasPrefix(body, "<") {
		return "the server returned an HTML page, not a mod. " +
			"/api/archipelago/mod is probably not deployed there — " +
			"point -base-url at a host that has it"
	}
	const max = 300
	if len(body) > max {
		return body[:max] + "... (truncated)"
	}
	return body
}

// MatchRoom prevents a local zip or an unexpected server response changing the slot.
func (m *Manifest) MatchRoom(seed int, class, savepath string) error {
	if err := validate(m); err != nil {
		return err
	}
	if m.Seed != seed || m.CharacterClass != class || m.Savepath != savepath {
		return fmt.Errorf("mod does not match room: have seed %d class %s savepath %s; need %d %s %s", m.Seed, m.CharacterClass, m.Savepath, seed, class, savepath)
	}
	return nil
}
