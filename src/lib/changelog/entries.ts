/**
 * Shared changelog data — consumed by /changelog page and its OG image.
 */

export interface ChangelogEntry {
  version: string;
  date: string;
  /** One-line summary used in OG preview and schema description fallbacks. */
  tagline: string;
  notes: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: 'v0.233',
    date: 'May 2026',
    tagline: 'Ironclad reworked into Tempered Edge — armor against spells, openings for steel',
    notes: [
      'Ironclad is gone. In its place is Tempered Edge: monsters gain +30 to all four elemental resistances (Cold, Fire, Lightning, Poison) and lose 30 physical resistance. Spell builds get squeezed; physical builds get a real opening',
      'The weekly challenge now reveals a seed spoiler after generating, matching the main generator',
    ],
  },
  {
    version: 'v0.232',
    date: 'April 2026',
    tagline: 'Weekly Challenge Leaderboard — submit runs, claim the crown',
    notes: [
      'Added a Leaderboard to the weekly challenge. Submit your fastest time to beat Baal on Normal — pick a class, paste a YouTube/Twitch/Streamable link as proof, and your run lands on the board. Top 3 show on the challenge page with a "Show all" toggle for the full list',
      'The week\'s #1 is immortalized on the Challenge Archive: each past week\'s card now carries a "Champion: name · class · time" line, frozen the moment the week ends',
      'A crown rides the #1 spot — gilded gold when claimed, awaiting a monarch when empty',
      'New runs ping a Discord channel',
      'Anti-spam: one submission per IP per hour (same player can still tighten their own time), 30-minute minimum run, video link required from a known host, plus the standard name validation and profanity filter',
    ],
  },
  {
    version: 'v0.231',
    date: 'April 2026',
    tagline: 'Challenge Archive + weekly challenge cache fix',
    notes: [
      'Added the Challenge Archive — every past weekly challenge is now playable from a single page. Each entry generates the original seed with the same mutation pair that was active that week',
      'Fixed a weekly-challenge cache bug where archived seeds would fail to download with "Zip not found." Generation and download now agree on the cache key for any past week',
    ],
  },
  {
    version: 'v0.23',
    date: 'April 2026',
    tagline: 'Item procs fixed and randomized per seed',
    notes: [
      'Fixed item proc effects (chance-to-cast and charges) that were silently broken — many were trying to cast passives like Cold Mastery, which the engine can\'t cast',
      'Procs now roll a fresh active skill per seed. Class-restricted items stay in their class so themes hold up',
      'Only vanilla level 1–18 skills are eligible — no random Hydra or Whirlwind procs from cheap items',
    ],
  },
  {
    version: 'v0.222',
    date: 'April 2026',
    tagline: 'Fury and Shock Wave pinned to Druid — engine-hardcoded handlers',
    notes: [
      'Fixed Fury playing no animation when Werewolf landed on a non-Druid class (e.g. Warlock). Fury\'s multi-hit handler is hardcoded to Druid in the D2R engine — same family as Zeal (Paladin) and Strafe (Amazon) — so even though the wolf form\'s animation was preserved, no swing or hit ever fired',
      'Pinned Fury and Shock Wave to Druid alongside the existing Strafe/Zeal/Sacrifice pins. Whenever Werewolf travels to another class, Fury is dropped and replaced by a substitute on the Druid tree (no orphaned form-only skill stranded with no wolf form to use it in). Same treatment for Shock Wave + Werebear',
    ],
  },
  {
    version: 'v0.221',
    date: 'April 2026',
    tagline: 'Shapeshift attack animations restored to vanilla',
    notes: [
      'Fixed shapeshift-form attacks playing the wrong animation when Werewolf/Werebear landed on a non-Druid class. Rabies, Hunger, and other form attacks now keep their vanilla wolf/bear animations regardless of host class — the form model owns the animation, not the base class model',
    ],
  },
  {
    version: 'v0.22',
    date: 'April 2026',
    tagline: 'Shapeshift overhaul — forms, attacks, and Lycanthropy travel together',
    notes: [
      'Shapeshift skills now follow whichever class gets Werewolf or Werebear, instead of being stranded on Druid. If your Sorceress gets Werewolf, she also gets Fury, Feral Rage, and Rabies',
      'Wolf-only attacks (Feral Rage, Fury, Rabies) follow Werewolf; bear-only attacks (Maul, Shock Wave) follow Werebear; Fire Claws, Hunger, and Lycanthropy can land with either form',
      'Cross-class melee skills on the form-host class are now usable while shifted — your shapeshifter Sorceress can swing Bash as a bear',
      'Each shapeshift attack skill now has a 50% drop chance per seed, matching how Zeal/Leap/Whirlwind already worked. Adds variety to which form attacks any given seed actually gives you',
      'Tiger Strike, Cobra Strike, and Phoenix Strike are now blocked while shifted — their charge-up mechanic can\'t release in wolf/bear form, so they\'d just stack uncastable charges',
    ],
  },
  {
    version: 'v0.214',
    date: 'April 2026',
    tagline: 'Controller skill tree fix + Remove Teleport option retired',
    notes: [
      'Controller skill tree menus now show the shuffled trees correctly — D2R loads a separate set of skill tree backgrounds in controller mode (with prerequisite arrows baked in), and those weren\'t being regenerated. Gamepad players were seeing vanilla arrows pointing at the wrong skills',
      'Removed the "Remove Teleport from skill pool" option',
    ],
  },
  {
    version: 'v0.213',
    date: 'April 2026',
    tagline: 'Synergies now work across all skill types',
    notes: [
      'Fixed synergies silently doing nothing on many skills — skills like Cleave, Bash, most auras, many passives, and summon bonuses had their named synergies point at skills that had been shuffled to other classes, so pouring points into the listed synergy skill did nothing. Synergies are now wired correctly across every skill',
    ],
  },
  {
    version: 'v0.212',
    date: 'April 2026',
    tagline: 'Real substitutes for dropped skills',
    notes: [
      'Fixed phantom tree slots — when a hardcoded skill (Zeal, Leap, Whirlwind, Dragon Flight, Fend, Inferno, Arctic Blast) lost its 50% coin flip, or when Teleport was excluded, the vacated slot previously had no icon or tooltip in-game. Dropped skills now get a real, functional substitute: another pool skill is cloned into the vacated row so the slot has a working icon, tooltip, and cast behavior',
      'Substitutes can cause the same skill to appear on two classes at once (e.g., Charged Bolt on both Amazon and Barbarian). A skill will never appear twice on the same class',
      'Zeal animation fix — hardcoded-animation skills (Zeal, Leap, Whirlwind, etc.) now animate correctly when kept on their native class',
    ],
  },
  {
    version: 'v0.211',
    date: 'April 2026',
    tagline: 'Season Beta Race retune',
    notes: [
      'Season Beta Race preset retuned based on race feedback: chat stays on, /players set to 1, XP boost lowered to 1.5× over Acts I–II, starting Horadric Cube removed',
      'New option: "Remove Teleport from skill pool" — drops Teleport from the shuffle entirely (Sorceress slot filled by a duplicate pool skill). On by default in the Season Beta Race preset',
      '/players input removed from the generator form (can still be driven via URL params for programmatic use)',
    ],
  },
  {
    version: 'v0.21',
    date: 'April 2026',
    tagline: 'Astral Wayfarer tuning for beta race',
    notes: [
      'Astral Wayfarer: +15% Faster Run/Walk is now an opt-in toggle (off by default on the Season Beta Race preset)',
      'Season Beta Race: Astral Wayfarer required level raised from 6 to 18',
      'Teleport skill and Astral Wayfarer repair/recharge costs reset to vanilla values',
      'Pestilence: gentler per-act poison ramp (+10 min / +15 max per act instead of +15 / +30); Act 5 now 85-150 over 8s (was 105-210)',
      'Pestilence: poison damage now scales with difficulty (×1.5 in Nightmare, ×2 in Hell) so it stays relevant as monster physical damage ramps up',
    ],
  },
  {
    version: 'v0.2',
    date: 'April 2026',
    tagline: 'Post-beta polish and stability pass',
    notes: [
      'No game mechanic changes — all 14 mutations behave identically to v0.15',
      'Pestilence: corrected card description to match actual antidote drop behavior (no gameplay change)',
      'Full traffic-spike optimization sweep under stress-test harness (faster mod generation under load)',
      'Open Graph preview images unified across all four pages; fixed broken challenge preview',
      'Footer refined: removed border, dropped redundant divider, added fade-to-black gradient',
      'Challenge page: removed redundant divider below How It Works',
    ],
  },
  {
    version: 'v0.15',
    date: 'April 2026',
    tagline: 'Home preview refresh and beta-launch polish',
    notes: [
      'Home page now previews the active mutation pair and themed week name instead of the raw seed number',
      '"Play The Challenge" CTA on the home page links straight through to the full weekly challenge',
      'The Horde: pack size and XP gain softened for a less punishing density curve',
      'Pestilence: smoother poison ramp across acts and broader monster coverage (no more blank poison slots)',
      'Hardcoded-class skills (Zeal, bow skills, etc.) now stay with their original class during shuffling',
      'Beta launch polish: legal footer, per-IP rate limit, proper OG image and favicon',
    ],
  },
  {
    version: 'v0.14',
    date: 'April 2026',
    tagline: 'Weekly challenge polish',
    notes: [
      'Live countdown to the next weekly challenge seed',
      'Install instructions now appear on the challenge page after generating',
      'Challenge settings (players, XP, teleport staff) shown alongside the weekly seed',
      'Weekly challenge now resets at midnight Pacific time (was midnight UTC)',
      'Improved typography, contrast, and mobile support on the challenge page',
    ],
  },
  {
    version: 'v0.13',
    date: 'April 2026',
    tagline: 'XP options and weekly challenge system',
    notes: [
      'XP multiplier option — scale experience gain per act',
      'Horadric Cube starting item option',
      'Weekly challenge seed system',
      'Performance improvements to mod generation',
    ],
  },
];

/** Most recent release — used by OG previews and navigation badges. */
export const LATEST_CHANGELOG = CHANGELOG[0];
