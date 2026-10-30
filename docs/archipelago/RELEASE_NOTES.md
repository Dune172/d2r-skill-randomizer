**Preview.** Generating a multiworld and connecting to a room both work. Whether the game
accepts the skill points the client hands over has not been confirmed in a real
playthrough yet, so treat a run as a test.

## Files

| File | What it is |
|---|---|
| `d2rr.apworld` | The world. Double-click it, or use *Install APWorld* in the Archipelago Launcher. |
| `d2rr-ap.exe` | The companion client. It fetches your slot's mod, installs it and talks to the room. |
| `D2R Randomizer.yaml` | An options template. Or build one at https://d2rrandomizer.com/archipelago |
| `SHA256SUMS.txt` | Checksums of the above. |

Use the apworld and the client from the **same** release. A mismatched pair is refused
when the client connects.

## Requirements

- Diablo II: Resurrected, with an offline character. The mod cannot be used on Battle.net,
  and the client refuses to act while the game is online.
- Archipelago 0.6.7 or newer.
- Windows.

## Setup

The full guide ships inside the apworld and is on the
[setup page](https://d2rrandomizer.com/archipelago). In short: install the apworld,
generate with your YAML, then with the game closed run

```
d2rr-ap.exe -host <host> -port <port> -slot <your name> -launch
```

and create a new offline character of your class.

## Known limits

- Horadric Keys and pooled stat points are experimental and off by default: checked in
  the game in town, not yet over a full run. Traps and DeathLink are untested.
- Skill points, stat points and keys now arrive by themselves while the client is
  running. The Draught of Attunement, the Tonic of Renewal and the Archipelago Sigil are
  gone, and so are runes and the Rune Percentage option. An old YAML that still sets it
  generates with a warning, and the setting is ignored.
- What you receive and send is shown in the game, in a text box beside the chat.
- This release changes the mod contract to 5: the client and the site must be updated
  together.
- On Nightmare and Hell, start the client with `-difficulty 1` or `-difficulty 2`.
- The client is unsigned, and it reads and writes the game's memory. Some antivirus
  software will warn about it.

Problems and questions: https://github.com/Dune172/d2r-skill-randomizer/issues
