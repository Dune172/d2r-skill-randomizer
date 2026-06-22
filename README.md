# D2R Randomizer

A web-based mod generator for **Diablo 2: Resurrected** that shuffles all skill trees across every class to create unique, deterministic, and shareable playthroughs.

Live at **[d2rrandomizer.com](https://d2rrandomizer.com)**

---

## What it does

Enter a seed number, choose optional mutations, and download a ready-to-install ZIP mod. Every skill from every class — Amazon, Sorceress, Necromancer, Paladin, Barbarian, Druid, Assassin, and Warlock — gets redistributed across all eight classes using a seeded PRNG. The same seed always produces the same result, so you can share a run with friends.

The mod is **offline-safe**: it only touches skill tree files and does not require going online, so it will not flag your Battle.net account.

**Mutations** are optional difficulty modifiers (e.g. monsters move 50% faster, all skills cost double mana) that stack on top of the shuffle. Two mutations rotate each week as the weekly challenge.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4 |
| Backend | Next.js API routes (Node.js) |
| Image processing | `sharp` (sprite assembly) |
| ZIP packaging | `archiver` / `adm-zip` |
| Hosting | Single-instance Node on a Hostinger VPS (PM2 + nginx) |

---

## Getting started locally

### Prerequisites

- Node.js 20+
- npm

### Setup

```bash
git clone https://github.com/<your-org>/d2r-skill-randomizer.git
cd d2r-skill-randomizer
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The `data/` directory is already included in the repository — it contains all the D2R game data TXT files the randomizer reads. You do **not** need a copy of the game to run the dev server or generate mods.

### Building for production

```bash
npm run build
npm start
```

---

## Project structure

```
src/
  app/                      # Next.js pages and API routes
    api/randomize/          # POST — runs the full randomization pipeline
    api/preview/            # GET — returns skill tree preview JSON
    api/download/           # GET — returns the generated ZIP
    api/counter/            # GET — total generation count
    components/             # Shared UI components
    challenge/              # Weekly challenge page
    generate/               # Main generator page
    archive/                # Past weekly challenges
  lib/
    randomizer/             # Core randomization engine
      tree-randomizer.ts    # Assigns skill trees to classes
      skill-placer.ts       # Places skills within trees, respects pinned skills
      synergy-updater.ts    # Remaps synergy references to co-located skills
      prereq-assigner.ts    # Rebuilds prerequisite chains
      mutations/            # One file per mutation implementation
    mutations/
      registry.ts           # Mutation definitions + 26-week rotation schedule
    sprites/
      icon-assembler.ts     # Assembles per-class skill icon sprites
      tree-stitcher.ts      # Stitches full skill tree UI sprites
    data-loader.ts          # Parses TXT game data files into JS objects
    zip-builder.ts          # Packages mod files into the downloadable ZIP

data/
  txt/                      # D2R game data files (tab-separated)
  json/                     # Pre-parsed JSON cache (skills.json, skilldesc.json)
  skill_tree_grid.csv       # 6×3 grid layout for each class's three skill trees

public/
  mutations/                # Mutation card images (.webp)
```

---

## How the randomizer works

1. **Seed** — A [Mulberry32](https://gist.github.com/tommyettinger/46a874533244883189143505d203312c) PRNG is initialized from the user's seed number. The same seed always produces the same output.

2. **Tree assignment** — Each class is assigned three skill trees drawn from the pool of 21 original trees (one from each of three index slots). Trees can be shared across classes.

3. **Skill placement** — ~45 skills are pinned to their original class (shapeshifting forms, dual-wield, etc.). The remaining ~195 skills are shuffled into the available slots, sorted by required level so low-level skills occupy the top rows.

4. **Synergy remapping** — Synergy formulas (`skill('Name'.blvl)`) are regex-replaced to reference skills that are actually present in the same tree.

5. **Prerequisite rebuilding** — Prerequisites are reassigned so that each skill in a row requires a skill from the row above it.

6. **Sprite stitching** — Skill icon sprites and skill tree UI sprites are assembled using `sharp`.

7. **ZIP packaging** — Modified TXT files and sprites are packaged as `d2rr_export_[seed].zip`, ready to drop into the D2R mods folder.

---

## Mutations

Mutations are optional modifiers applied on top of the shuffle. Each one modifies one or more game data TXT files through a `MutationContext` object passed through the pipeline.

| Mutation | Effect |
|---|---|
| Hyperdrive | Monsters move 50% faster; your run speed increases 30% |
| Heavy Burden | Armor strength requirements +50%; qualifying armor provides more defense |
| Hollow Shell | Max life and mana −50%; mana regenerates faster |
| Bloodthirst | All monsters passively regenerate life |
| The Horde | Pack sizes ×3; experience reduced by a third |
| Glass Cannon | Monsters deal 2× damage but have half the life |
| Pestilence | All monsters deal poison damage; antidote potions cost 10× more |
| Arcane Surge | Skill mana costs ×2.5; all skills deal 50% more elemental damage |
| Tempered Edge | Monsters gain +30 elemental resistances but lose 40 physical resistance |
| Titan's Grip | Weapon requirements +50%; qualifying weapons deal 2× damage; magic weapons gain/boost chance-to-cast procs from a wide skill pool |
| Dead Reckoning | Fewer stat points per level; monsters drop better loot |
| Entropy | Equipment degrades 4× faster; repairs cost 10× more |

Two mutations are active each week as the weekly challenge, rotating on a 26-week schedule defined in [`src/lib/mutations/registry.ts`](src/lib/mutations/registry.ts).

### Adding a new mutation

1. Add a `MutationDef` entry to `MUTATIONS` in [`src/lib/mutations/registry.ts`](src/lib/mutations/registry.ts).
2. Create `src/lib/randomizer/mutations/your-mutation.ts` and export an `applyYourMutation(ctx: MutationContext): void` function.
3. Register it in [`src/lib/randomizer/mutations/index.ts`](src/lib/randomizer/mutations/index.ts).
4. Add a card image to `public/mutations/your-mutation.webp`.

The `MutationContext` exposes parsed rows for every game data file (`monstats`, `armor`, `weapons`, `charstats`, `skills`, etc.) as plain JS objects — just read and mutate the fields you need.

---

## Versioning and determinism

The randomization pipeline includes a `PIPELINE_VERSION` integer ([`src/lib/randomizer/pipeline-version.ts`](src/lib/randomizer/pipeline-version.ts)). **Any change that would cause the same seed to produce different output must increment this version.** This prevents saved seeds from silently breaking for existing users.

Things that require a version bump:
- Adding, removing, or reordering entries in `CLASS_DEFS`
- Changing the skill pinning logic in `skill-filters.ts`
- Changing the tree assignment or skill placement algorithms
- Changing synergy or prerequisite logic

Things that do **not** require a bump:
- UI changes
- New mutations (they're opt-in and additive)
- Bug fixes that only affect edge-case seeds

---

## Contributing

Contributions are welcome. A few guidelines:

- **Game data files** (`data/txt/`) are included in the repository. If a D2R patch changes game data, update the files and note the patch version in your PR.
- **Keep mutations self-contained.** Each mutation should only touch the TXT files it needs and leave everything else untouched.
- **Don't break determinism.** If your change could alter output for an existing seed, increment `PIPELINE_VERSION`.
- **Test in-game when possible.** The best way to verify a mutation is to load the generated mod in D2R and play through Act 1.

Good first contributions:
- New mutations (difficulty modifiers, quality-of-life tweaks)
- UI improvements on the generator or challenge pages
- Improving the skill preview panel
- Performance improvements to sprite assembly or ZIP packaging

---

## Deployment

The production server runs on a Hostinger VPS with PM2 and nginx. See [`deploy/README.md`](deploy/README.md) for the full setup guide including nginx config, PM2 config, TLS setup, and the deploy flow.

The app runs as a **single PM2 instance** — the in-memory ZIP cache, generation queue, and rate limiter all require single-instance state.

### Health check

```bash
curl https://d2rrandomizer.com/api/health
```

Returns queue depth, ZIP cache size, memory usage, and total generation count.
