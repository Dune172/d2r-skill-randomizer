# Archipelago: delivering keys, runes and pooled points

Status: proposal with a working prototype (branch `claude/ap-keys-runes-delivery`).
The options stay default off and labelled "not working" until you decide.

## The short version

The preview's blocker was that nothing could **create** the custom stats `ap_keys` (368)
and `ap_mail` (369). The client can only change a stat entry that already exists.

**Player spell 4 creates them.** It is the vanilla "Healing Potion" item spell, and it
adds each `stat1..3` / `calc1..3` of the item to the drinker's base stats, permanently
when `len` is empty. Spell 8, which the preview used, looks the same in `misc.txt` but
ignores those columns. It adds one to a random attribute.

Measured in town on D2R 3.3.93847 (2026-10-29), with the gate mod `seed987002` changed
only from spell 8 to spell 4 on the Draught (`elx`) and the Receipt (`hrb`):

| Step | Result |
|---|---|
| Sigil alone in the Cube (369 absent) | Draught of Attunement + Sigil back |
| Drink the Draught | `5=1`, `368=1`, `369=256` on **both** copies of the character; no attribute changed |
| `probe -set 369=2`, transmute the Sigil (`hrt`) | El Rune + the other Sigil (`sol`) + Receipt |
| Drink the Receipt | `369=3` (offer + 1) on both copies |
| Save and Exit, re-enter | `5=1`, `368=1`, `369=3` still there on both copies |
| Transmute `sol` with `369=3` | nothing (cannot deliver twice) |
| `probe -set 369=4`, transmute `sol` | El Rune + `hrt` + Receipt (the other Sigil's path) |

So the existing design works almost unchanged: keys and runes need only the spell
number fixed.

## Recommended approach

1. **Draught and Receipt use spell 4** instead of 8. That's all keys and runes need.
2. **A Tonic of Renewal** (vanilla `mpf`, Full Mana Potion: unused, never spawns,
   already a spell 4 item) recreates the point pools. It adds `newskills` +1, and
   `statpts` +1 when stat points are pooled. This fixes the "pool hits zero" limit for
   skill points and pooled stat points. The client then writes the pool straight back to
   its target, so the Tonic only provides an entry to write to.
3. **Brew recipes, tried in file order after the mail recipes:**
   - Sigil alone, `ap_mail` ≤ 0 (absent) → Draught + Sigil. This replaces a lost starting
     Draught.
   - Sigil alone, `ap_mail` ≤ 1 (idle) → Tonic + Sigil.

   While a rune is on offer, the same Sigil delivers the rune instead. Once the Receipt
   is drunk the mailbox is idle again and the next transmute brews a Tonic.

Cube `op` meanings, from D2MOO `PlrTrade.cpp`, all on the player's **base** stat: 7 is
≥, 8 is ≤, 9 is ≠ and 10 is =. An absent stat reads 0.

### What the prototype changes

| Part | Change |
|---|---|
| `src/lib/randomizer/ap-mode.ts` | `pSpell` 8 → 4; Tonic item (`mpf`) and its two brew recipes; a name string for `mpf` (the game has none; id 42000, clear of the pipeline's 40000+ and 41000+ ranges); `ApModeOptions.pooledStats`; `ApTables.tonic`; `AP_CONTRACT_VERSION` 3 → 4 |
| `src/app/api/archipelago/mod/route.ts` | Reads `options.pooledStats`; adds `p` to the AP cache-key segment |
| `apworld/d2rr/__init__.py` | `mod_options.pooledStats` (true when stat points are pooled) |
| `tools/ap-client` | Manifest `ContractVersion` 4 and `tables.tonic`; "make a Tonic" hints when a pool entry is missing **and** points are owed; `probe -game` lists the game's own copy |
| `scripts/verify-ap-mode.mjs` | Checks spell 4 with no duration on all three items, the Tonic's stats and name string, the recipe order, and a pooled-stats case |
| `docs/archipelago` | This file; gate results in `DESIGN_NOTES.md`; G3 step 1 and a new G6 in `PLAYTEST.md` |

Checked: `tsc`, `go vet` and `go test` for the client, `verify-ap-mode.mjs` (11 of 11),
and `verify-generate-mod-refactor.mjs` (all 40 non-AP tuples byte-identical to the
fixture). The apworld tests were not run: this PC has no Python, so CI covers them.

Not changed: option labels and help text, the apworld logic, and the mail state machine
(`internal/grants/mail.go`). The Receipt acknowledgement works as designed, so
`-mail-flip` and `-mail-skip` stay as the manual escape hatches.

## Candidates considered

- **Starter save per class with 368/369 already present.** It would work, since custom
  stats are stored as value + 1 and are never dropped. But it needs a `.d2s` stat
  bitstream writer, a client step to install the save, and only helps a character made
  from it. It's no longer needed. It stays the fallback if a D2R patch breaks spell 4.
- **Other vanilla pSpells.** From D2MOO `SkillItem.cpp`: 3 and 6 put stats in a timed
  state that expires; 5 is rejuvenation (fixed life and mana percentages); 9 is stamina;
  8 adds a stat chosen by the item's own data and ignores the columns (which matches the
  gate result); 1, 2, 7, 10 and 11 are identify, portal, cube and fireballs. **Only 4
  adds the columns permanently.** Its one clamp (`maxstat`) does not apply, because
  `maxstat` is empty for 4, 5, 368 and 369.
- **Client reads the inventory to acknowledge a rune.** This works on 3.3 if classIDs
  are mapped through the mod's own `weapons`/`armor`/`misc` rows (skipping `Expansion`).
  `obsdebug items` then named Khalim's Eye and Brain, Staff of Kings, the Sigils, Draught,
  Receipt and El Rune correctly, including items in the Cube. It is not needed now, but
  could replace `-mail-flip` later, since the client could see which Sigil is held.
- **A cube recipe that changes a stat.** Not possible: recipes test player stats
  (`op`) but can only put stats on output items.

## In-game checks (all in town)

**Done 2026-10-29.** G2 and G3 (the table above) on the hand-patched gate mod. Then G6
on the mod this branch generates (seed 987002, Paladin, `ap_gate_pal`, `keyItems` and
`pooledStats` on), with character Apgate:

| Step | Result |
|---|---|
| Spend the last skill point | stat 5 gone from both copies |
| `probe -set 369=1`, Sigil alone in the Cube | Tonic + Sigil; tooltip reads "Tonic of Renewal" |
| Drink the Tonic | `4=1` and `5=1` on both copies |
| Spend that point, Save and Exit, re-enter | the skill (Death Mark) still learned; `4=1`, `368=1`, `369=1` kept |

**Still to run:**

1. **Fresh character.** Create one: stats 5, 368 and 369 are absent; Sigil alone →
   Draught (not a Tonic); drink it → `5=1`, `368=1`, `369=256`. This tests the op 8
   ≤ 0 recipe, which D2MOO says matches an absent stat.
2. **Spend the Tonic's stat point** in the character screen and see that it stays
   (the entry itself was shown to come back and survive a save).
3. **Client end to end.** Run `d2rr-ap` against a local room with runes and keys on,
   send an El Rune and two keys: the client offers the rune, and after the Receipt it
   logs "collected" and `368` reads 3. Needs a local Archipelago server; this PC has no
   Python.
4. **Key gate (needs Act II items).** Staff of Kings + Amulet of the Viper refuses at
   `368=2` and transmutes at `368=3`. This uses op 7 (≥), the same mechanism as the
   mail's op 10 (=) and the brew's op 8 (≤), both measured. Getting the two items means
   leaving town, so this one is left for a normal playthrough. In town it could be
   approximated with a test-only recipe on op 7 in a local copy of the mod.

## Decisions for you

1. **Adopt spell 4 + Tonic?** Recommended. It's small, data-only for keys and runes,
   and fixes the zero-pool limit as well.
2. **Relabel the options.** After checks 1–3 pass, change "not working in this preview"
   to "experimental" in `src/lib/archipelago/options.ts`, `apworld/d2rr/options.py`,
   `YamlBuilder.tsx` and the release notes. Still default off?
3. **Tonic art.** `mpf` shows a large blue potion. That's fine to start with; a
   custom icon would need an HD sprite.
