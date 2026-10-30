//go:build windows

package game

import (
	"encoding/binary"
	"fmt"
	"strings"
	"unicode/utf8"

	"golang.org/x/sys/windows"
)

// UI widget layout, measured on D2R 3.3.93847. A widget's name and its text are each a
// string record {data pointer, length, capacity}. A capacity with the top bit set means
// the text lives in a small buffer inside the widget itself (15 bytes).
const (
	widgetName      = 0x08
	widgetText      = 0x88
	stringInlineBit = uint64(1) << 63
)

// FindWidget finds a UI widget by name anywhere in the game's UI tree. It walks the
// whole tree (several hundred widgets), so callers keep the address and check it with
// WidgetNamed before each use.
func (c *Client) FindWidget(name string) (uintptr, error) {
	for _, p := range c.Panels() {
		if p.Path == "/"+name || strings.HasSuffix(p.Path, "/"+name) {
			return p.Addr, nil
		}
	}
	return 0, fmt.Errorf("the game has no %s text box (is this room's mod installed?)", name)
}

// WidgetNamed reports whether addr is still the widget called name.
func (c *Client) WidgetNamed(addr uintptr, name string) bool {
	if addr == 0 {
		return false
	}
	read := c.proc.ReadIntoBuffer
	ptr, err := readUint(read, addr+widgetName, 8)
	if err != nil {
		return false
	}
	b := make([]byte, len(name)+1)
	if read(uintptr(ptr), b) != nil {
		return false
	}
	return string(b[:len(name)]) == name && b[len(name)] == 0
}

// SetWidgetText replaces a text widget's text in the buffer the game gave it; the game
// draws the new text on its next frame. It never allocates: text longer than the buffer
// is cut at a character boundary.
func (c *Client) SetWidgetText(addr uintptr, text string) error {
	read := c.proc.ReadIntoBuffer
	hdr := make([]byte, 0x18)
	if err := read(addr+widgetText, hdr); err != nil {
		return err
	}
	data := uintptr(binary.LittleEndian.Uint64(hdr[0:]))
	length := binary.LittleEndian.Uint64(hdr[8:])
	capacity := binary.LittleEndian.Uint64(hdr[16:]) &^ stringInlineBit
	if data < 0x10000 || capacity == 0 || capacity > 1<<16 || length > capacity {
		return fmt.Errorf("text box is not ready")
	}
	b := fitUTF8(text, int(capacity))
	h, err := c.openWrite()
	if err != nil {
		return err
	}
	defer windows.CloseHandle(h)

	var n [8]byte
	binary.LittleEndian.PutUint64(n[:], uint64(len(b)))
	writeLength := func() error {
		return windows.WriteProcessMemory(h, addr+widgetText+8, &n[0], 8, nil)
	}
	// Order the two writes so a frame drawn in between never reads past the new end:
	// shrink the length first, or grow it last.
	if uint64(len(b)) < length {
		if err := writeLength(); err != nil {
			return err
		}
	}
	body := append(b, 0)
	if err := windows.WriteProcessMemory(h, data, &body[0], uintptr(len(body)), nil); err != nil {
		return err
	}
	if uint64(len(b)) >= length {
		return writeLength()
	}
	return nil
}

// fitUTF8 cuts s to at most max bytes without splitting a character.
func fitUTF8(s string, max int) []byte {
	if len(s) <= max {
		return []byte(s)
	}
	cut := max
	for cut > 0 && !utf8.RuneStart(s[cut]) {
		cut--
	}
	return []byte(s[:cut])
}
