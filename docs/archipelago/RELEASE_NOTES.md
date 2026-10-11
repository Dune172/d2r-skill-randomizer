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

- Options marked EXPERIMENTAL (Horadric Keys, pooled stat points, runes, traps, DeathLink)
  are off by default and unconfirmed in the game.
- On Nightmare and Hell, start the client with `-difficulty 1` or `-difficulty 2`.
- The client is unsigned, and it reads and writes the game's memory. Some antivirus
  software will warn about it.

Problems and questions: https://github.com/Dune172/d2r-skill-randomizer/issues
