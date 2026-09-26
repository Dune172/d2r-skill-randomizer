# Nexus Mods — Upload Kit

Everything needed to create the D2R Randomizer page on Nexus in one sitting.
Listing copy lives in `listing-drafts.md` (section c) — this file adds the sample seeds, file descriptions, and the step-by-step.

## The three showcase seeds

Scouted by running the actual randomizer pipeline (same `PIPELINE_VERSION` as production) across seeds 1–200 and ranking by iconic cross-class chaos. Generate each at https://d2rrandomizer.com/generate with **no mutations**, default settings.

### Seed 136 — "The Teleporting Barbarian"
Barbarian gets **Teleport, Chain Lightning, and Hydra**. Sorceress is melee now (Berserk, Blessed Hammer). Necromancer picks up Smite and Fanaticism. Paladin becomes a caster with Frozen Orb and Poison Nova, and the Amazon inherits Corpse Explosion and Blizzard.
ZIP name: `d2rr_sample_seed_136.zip` — file description: *"Sample: seed 136 — the Teleporting Barbarian. Barb gets Teleport + Chain Lightning + Hydra; Paladin casts Frozen Orb; Necro Smites."*

### Seed 96 — "Necromancer, but make him angry"
Necromancer gets **Teleport, Berserk, and Mind Blast**. Paladin turns full elementalist (Blizzard, Frozen Orb, Chain Lightning). Amazon stacks Hydra, Fire Wall, Corpse Explosion, and Battle Orders. Barbarian throws Bone Spears.
ZIP name: `d2rr_sample_seed_96.zip` — file description: *"Sample: seed 96 — Teleporting Berserk Necromancer; Blizzard Paladin; Battle Orders Amazon."*

### Seed 184 — "Smite witch"
Sorceress gets **Smite and Mind Blast**. Paladin gets Teleport, Poison Nova, and Revive. Amazon becomes the elemental bomber (Meteor, Blizzard, Hydra, Hurricane). Necromancer yells Battle Orders.
ZIP name: `d2rr_sample_seed_184.zip` — file description: *"Sample: seed 184 — Smiting Sorceress; Teleport + Poison Nova Paladin; Meteor/Blizzard Amazon."*

## Page setup checklist

1. Create/log into your Nexus account → https://www.nexusmods.com/games/diablo2resurrected → "Upload a mod".
2. **Name:** `D2R Skill Randomizer — web generator + sample seeds`
3. **Category:** Gameplay (or Miscellaneous if Gameplay feels wrong once you see the list).
4. **Summary (short field):** `Shuffles all ~240 skills across all 8 classes — synergies and prerequisites remapped so trees still work. Deterministic seeds: race a friend on the same shuffle. Generate any seed free at d2rrandomizer.com. Offline only.`
5. **Description:** paste section (c) from `listing-drafts.md`, then add a "Sample seeds on this page" section using the three blurbs above. Keep every link's `?utm_source=nexus` tag.
6. **Files:** upload the three sample ZIPs with the descriptions above. Mark the newest as the main file. Nexus requires at least one file — these are it; the generator link covers every other seed.
7. **Permissions/credits:** fan project; not affiliated with Blizzard; no other authors' assets used. Distribution permission: up to you — suggest "credit required, no reposting" since the canonical source is the generator.
8. **Tags:** randomizer, skills, offline, single-player.
9. After publishing: check the page renders, then watch the dashboard for `nexus` sessions over the next days.

## Notes

- Nexus prohibits files that phone home — the ZIPs are pure game-data files, so that's satisfied. The *generator* lives off-site, which is allowed and has precedent (mod managers/utilities are listed in this section).
- If a moderator questions the web-tool model, the sample ZIPs make the page self-sufficient: they're complete, playable mods on their own.
- Install instructions are already in the listing draft's "How to install" section — they apply to the samples verbatim.
