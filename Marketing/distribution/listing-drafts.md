# D2R Randomizer — Listing Drafts

Ready-to-paste copy. Before posting, replace `utm_source=TARGET` with the channel value:
`nexus`, `moddb`, `discord`, `d2jsp`, `phrozenkeep`, `purediablo`, `diablo2io`, `reddit`, `steam`, `github`.
The Nexus/ModDB draft (c) and Discord draft (d) already have theirs filled in.

---

## (a) Short description (~60 words)

> D2R Randomizer is a free web tool that builds a ZIP mod for Diablo II: Resurrected. It shuffles all ~240 skills across all 8 classes — including a custom Warlock class — and remaps synergies and prerequisites so the trees still work. Seeds are deterministic, so you can race a friend on the same shuffle. Offline play only. Fan-made, not affiliated with Blizzard.
>
> https://d2rrandomizer.com?utm_source=TARGET

---

## (b) Long description (~250 words)

> I built D2R Randomizer because after twenty-something years I could clear Normal half asleep, and I wanted D2 to surprise me again. It's a free web tool: pick a seed, optionally add mutations, download a ZIP, drop it in your mods folder, and play offline with a completely scrambled skill pool.
>
> What it does:
>
> - **Full skill shuffle.** All ~240 skills get redistributed across all 8 classes — the 7 you know plus a custom Warlock class. Your Barbarian might open with Blizzard; your Sorceress might be a summoner now.
> - **Trees that actually work.** Synergies and prerequisites are remapped to the new layout, so points still chain into real builds instead of dead ends.
> - **Deterministic seeds.** The same seed always produces the same shuffle. Share the seed string and a friend gets your exact world — race them on it.
> - **14 optional mutations.** Opt-in difficulty modifiers like Glass Cannon, The Horde, and Mystery Box, stacked on top of the shuffle. Skip them all if you just want the scramble.
> - **Biweekly mutation challenge.** Every other Monday a fixed seed with 2–3 set mutations goes up, with a leaderboard. Runs need a video link to count.
>
> The mod only touches skill tree files and is for **offline play only**. It doesn't touch online characters and won't flag a Battle.net account — but don't take modded characters online; that's not what this is for.
>
> Fan-made, no Blizzard affiliation. Free, no account needed.
>
> Generator: https://d2rrandomizer.com?utm_source=TARGET
> Current challenge: https://d2rrandomizer.com/challenge?utm_source=TARGET

---

## (c) Nexus / ModDB page description

**Suggested page title:** D2R Skill Randomizer — sample seeds + web generator
**Before publishing:** verify the install steps below against the actual instructions on d2rrandomizer.com (folder name, launch args) — these are the standard D2R `-mod` steps and may need adjusting to match the site's wording.
**Suggested category (Nexus):** Utilities / Gameplay
**Links in this draft use `utm_source=nexus` — change to `moddb` for ModDB.**

### What it does

D2R Randomizer shuffles all ~240 skills in Diablo II: Resurrected across all 8 classes — Amazon, Sorceress, Necromancer, Paladin, Barbarian, Druid, Assassin, plus a custom Warlock class. Synergies and prerequisites are remapped to the shuffled layout, so skill trees still chain into working builds instead of orphaned points.

The shuffle is seeded and deterministic: the same seed always generates the same mod, so you can share a seed string and race a friend on the identical scramble. On top of the shuffle you can stack any of 14 optional difficulty mutations (Glass Cannon, The Horde, Mystery Box, and others).

The files on this page are pre-generated **sample seeds** so you can try it directly. For your own seed and mutation combo, use the free web generator: https://d2rrandomizer.com?utm_source=nexus

There's also a biweekly mutation challenge — a fixed seed plus 2–3 set mutations, rotating every other Monday, with a leaderboard (video link required): https://d2rrandomizer.com/challenge?utm_source=nexus

### How to install

1. Download a sample seed ZIP from this page, or generate your own at https://d2rrandomizer.com?utm_source=nexus
2. Extract the ZIP into your D2R `mods` folder (so you end up with `Diablo II Resurrected\mods\<modname>\...`).
3. Launch the game with the mod parameter: add `-mod <modname> -txt` to your launch arguments.
4. Start an **offline** character and check your skill tree — if it looks wrong, something is, but wrong in the right way.

To uninstall, delete the mod folder and remove the launch arguments. Vanilla files are never modified.

### FAQ

**Is this safe for my Battle.net account?**
The mod is offline-only. It only touches skill tree files, loads through D2R's official `-mod` system, never modifies your base game install, and does not require going online. It will not flag a Battle.net account. That said: it is for offline characters only — do not attempt to use modded content in online play. Online and ladder play are not supported and never will be.

**Does it work with the current D2R patch?**
The generator targets the current patch. If a game update breaks something, regenerate your seed from the site for a fresh ZIP.

**Can two people play the same shuffle?**
Yes — that's the point of seeds. Same seed, same shuffle, every time. Send your friend the seed string.

**What's the Warlock?**
A custom eighth class included in the shuffle pool, so the ~240 skills spread across 8 classes instead of 7.

**Are mutations required?**
No. All 14 are opt-in. Plain shuffle is a perfectly good run.

**Is this official?**
No. Fan-made tool, not affiliated with or endorsed by Blizzard.

---

## (d) Discord mod-showcase message (~80 words)

> Made a thing: a web tool that generates a randomizer mod for D2R. It shuffles all ~240 skills across all 8 classes (plus a custom Warlock class) and remaps synergies/prereqs so the trees still function. Seeds are deterministic — roll one, send it to a friend, race the same shuffle. 14 optional mutations if you want it to hurt. Offline-only, loads via -mod, doesn't touch your install. Free, no account. Feedback very welcome.
>
> https://d2rrandomizer.com?utm_source=discord
