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
    version: 'v0.262',
    date: 'September 2026',
    tagline: "No Guard strips enemy defence too, and Titan's Grip asks for less strength",
    notes: [
      'No Guard now sets monster defence to zero as well as yours. Taking away all of your armour and every defensive skill while enemies kept their full defence left you missing a lot of swings on top of it — now nobody on the field has defence, and the danger is how hard the hits that do land on you hit',
      'Your own side keeps its defence under No Guard — hirelings, golems, skeletons, Valkyries and the rest are untouched, so a summoner is not left with a wall of paper',
      'Being underlevelled still costs you accuracy under No Guard. Chance to hit also depends on the gap between your level and the monster’s, so a character fighting well above its level will keep missing even against an enemy with no defence at all',
      "Titan's Grip now raises weapon strength and dexterity requirements by 30% instead of 50%. At 50% the best bases sat out of reach for so long that the doubled damage they carry rarely got used — a Colossus Blade now asks 246 strength instead of 284, and the requirement still costs you real stat points",
      'Both changes affect any challenge running No Guard or Titan’s Grip. Skill trees are untouched, so a seed still generates exactly the same trees — only the monster and weapon numbers changed. Re-download the mod for the current challenge to pick them up',
    ],
  },
  {
    version: 'v0.261',
    date: 'August 2026',
    tagline: 'Four new mutations join the challenge rotation',
    notes: [
      'Molasses — every monster moves at half speed, but every blow they land hits twice as hard. Your own speed is untouched, so there is room to kite if you can make it count',
      'No Guard — armour provides no defence at all, and every defence-granting skill is pulled out of the skill trees and replaced with something else. Resistances and blocking are all that is left between you and the floor',
      'Court of Kings — three times as many champion and unique packs roam every area, with a third fewer common monsters between them. Almost everything you meet has a title and an aura to match',
      'Band of Brothers — your hireling is the hero of the run: far tougher, far deadlier, and casting at much higher skill levels. In exchange you gain a quarter less life per point of vitality, so your place is behind them',
      'Each of the four has its own icon on the challenge page, matching the rest of the set',
      'Some mutation pairings can no longer turn up in the same challenge. A few combinations either cancelled each other out or stacked into something unplayable',
    ],
  },
  {
    version: 'v0.260',
    date: 'August 2026',
    tagline: 'The seed spoiler now shows the real skill icons, with tooltips',
    notes: [
      'The spoiler now shows the actual in-game skill icons laid out like the skill window, three trees side by side for each class, instead of a list of names in boxes',
      'Hover or tap any icon for the skill name and its description, styled like the tooltip you see in game',
      'Each icon is framed in the colour of the class the skill came from, so you can see at a glance how mixed a tree is',
      'Classes start collapsed so you can open just the one you are playing instead of scrolling past all eight',
      'Fixed a handful of skills being labelled with the wrong name in the spoiler. Where one shuffled skill had been chained onto another, the spoiler credited the skill in the middle of the chain — the game itself was always right, only the spoiler was lying',
      'Your seed still generates exactly the same trees — this only changes what the spoiler shows you',
    ],
  },
  {
    version: 'v0.259',
    date: 'August 2026',
    tagline: 'Skill tree bonuses on items now name the tree they actually boost',
    notes: [
      'Fixed items naming the wrong skill tree. An amulet reading "+1 to Random 3" was buffing the tree labelled Random 1 — the item text and the skill window numbered the trees in opposite directions. Random 2 lined up either way, which is why it only looked broken half the time',
      'Skill tabs are now numbered left to right for every class, so the leftmost tab in the skill window is Random 1',
      'Your seed still generates exactly the same trees — only the labels changed',
    ],
  },
  {
    version: 'v0.256',
    date: 'July 2026',
    tagline: 'Synergies actually boost your damage now, plus mana, icon and Zeal fixes',
    notes: [
      'Synergy bonuses now actually apply. A skill would list the right synergy, say Skeleton Mastery boosting Zeal, but the damage was still coming from whatever skill that synergy replaced. Points you spent did nothing',
      'Fixed synergy lines naming the wrong skill. On skills with several synergies, like Vengeance and the resistance auras, most lines credited a skill that was not driving that number',
      'Revive, the Druid wolf and bear summons, and Health Link now get their synergy bonuses. They were silently giving nothing',
      'Fixed skills costing thousands of mana under Arcane Surge. Iron Golem wanted 8,685 mana instead of 88, and Revive, the other golems, Blizzard, Enchant and Valkyrie were hit the same way',
      'Fixed skills showing a completely unrelated icon. The name, tooltip and behaviour were right, only the picture was wrong',
      'Zeal is pinned to the Paladin again. It can still be dropped from a seed like the other pinned skills, in which case another skill takes its slot',
      'These fixes re-roll every seed, so a seed number now generates different trees than it did before',
    ],
  },
  {
    version: 'v0.255',
    date: 'June 2026',
    tagline: 'New Hell leaderboard, per-difficulty XP Boost, and a round of balance fixes',
    notes: [
      'New Hell leaderboard on each weekly challenge — a single top spot crowning the fastest Baal kill on Hell, shown alongside the existing Normal board',
      'XP Boost can now be toggled per difficulty — turn the bonus on for Normal, Nightmare, and Hell independently instead of all or nothing',
      'The challenge leaderboard now spells out how runs are timed: In-Game Time is used, falling back to real time (RTA) when no IGT is shown',
      'Fixed summoned pets missing their synergy bonuses — summon synergies now properly scale your pets’ damage',
      'Reworked the bonus skill procs that can roll on items and rebalanced Arcane Surge',
      'House Always Wins tweaks: monsters no longer drop bows or melee weapons, and the gamble pool now includes more item types — daggers, throwing weapons, and class-specific items',
      'Weekly Mutation Challenges can no longer accidentally generate in Race Mode',
    ],
  },
  {
    version: 'v0.254',
    date: 'June 2026',
    tagline: 'Fixed crashes when fighting the Ancients, Duriel, and other skill-using monsters',
    notes: [
      'Fixed a crash when fighting the Ancients: on some seeds Korlic’s Whirlwind had its underlying skill data reshuffled into a different skill, and the game would crash the instant he tried to use it — which is why it could crash before any whirlwind even appeared',
      'The same crash could hit any monster that performs a reshuffled skill — including Duriel and the Act 2 mercenary (Jab), and the Assassin’s Shadow Warrior and Shadow Master (their martial-arts skills)',
      'The fix is entirely on the monster’s side: when a monster’s skill has been reshuffled this way, it simply drops that skill and falls back to a basic attack. Your skill trees are untouched, so existing characters and the current challenge seed play exactly the same — only the crash is gone',
    ],
  },
  {
    version: 'v0.253',
    date: 'June 2026',
    tagline: 'Melee skills now hit properly on Sorceress and Warlock',
    notes: [
      'Melee skills shuffled onto the Sorceress and Warlock now keep their real weapon-swing animation (A1) instead of being downgraded to a cast, so they look and feel like proper attacks',
      'Fixed a vanilla data bug where the Warlock’s attack animations had mismatched frame data — the cause of swings that played but never landed a hit. Every generated mod now ships a repaired animdata.d2',
      'Zeal is no longer locked to the Paladin — it can now shuffle onto any class and performs its full multi-hit swing correctly, the same way the Passion runeword grants it to off-class characters',
      'Sacrifice can now be shuffled onto the Sorceress and Warlock, and Smite now plays a proper attack animation when shuffled to other classes',
      'Fixed a vanilla gap where three Amazon animations were missing their hit trigger — without this, Smite shuffled onto the Amazon could swing without connecting while holding certain weapons',
      'Race Mode and weekly Mutation Challenge runs now save into their own character folders, so competitive characters no longer mix in with your casual randomizer saves',
    ],
  },
  {
    version: 'v0.252',
    date: 'June 2026',
    tagline: 'Race Mode now locks the field to a single class',
    notes: [
      'Race Mode now randomizes only one class — chosen automatically from the seed, so everyone racing the same seed plays the same class. The generate page tells you which class to use after generating',
      'Every other class is filled with 30 Prayer skills, leaving exactly one usable class for a fair, focused race',
    ],
  },
  {
    version: 'v0.251',
    date: 'June 2026',
    tagline: 'Three mutations per challenge, plus two new mutations',
    notes: [
      'Future Mutation Challenges now run with three mutations instead of two, for a tougher and more varied twist each cycle. Past and current challenges keep their original two',
      'New mutation — House Always Wins: vendors no longer sell weapons or armor, and monsters drop gold instead of gear. Gold drops are massively increased, and gambling becomes the only way to arm yourself',
      'New mutation — Mystery Box: every skill in the tree is disguised, with identical icons and "???" for every name and description. You pick blind and find out what you got by using it',
    ],
  },
  {
    version: 'v0.25',
    date: 'May 2026',
    tagline: 'Turbo preset and Race Mode toggle',
    notes: [
      'New Turbo preset: 3× XP across all acts, Horadric Cube from the start, a Teleport Staff (req. level 6) dropped by Corpsefire, +15% Faster Run/Walk, and auras on all mercenaries — great for casual or power-levelling runs',
      'New Race Mode toggle on the generate page: when enabled, the included shortcut launches the game in race-friendly configuration. On by default for the Season Beta Race preset, off for Turbo',
    ],
  },
  {
    version: 'v0.244',
    date: 'May 2026',
    tagline: 'Downloaded zip renamed so it no longer looks like the mod folder inside it',
    notes: [
      'The downloaded file is now named d2rr_export_[seed].zip instead of d2rr_seed[seed].zip. The mod folder inside (seed[seed]) keeps the same name — only the archive you download has changed',
    ],
  },
  {
    version: 'v0.243',
    date: 'May 2026',
    tagline: 'Skill icons now shuffle correctly on low graphics settings',
    notes: [
      'Skill icons were showing the wrong (vanilla) layout for players using low graphics settings. The mod now includes the correct shuffled icons for all quality levels',
    ],
  },
  {
    version: 'v0.242',
    date: 'May 2026',
    tagline: 'Mutation Challenge — 14-day cycle, rebalanced mutations, new item procs',
    notes: [
      'The Weekly Challenge is now the Mutation Challenge and runs every 14 days instead of 7. Each challenge is numbered and shown as "Challenge X" throughout the site',
      'Heavy Burden: magic body armor, helmets, and shields with any affix now gain a 10% chance to cast a random skill when hit — skill power scales with item level',
      "Titan's Grip: proc chances on qualifying weapons are doubled, and proc skill level scales with item level",
      'Procs can now roll higher-tier skills — powerful items can proc Blizzard, Meteor, Hydra, and similar top-end skills',
      'Bloodthirst: monster life regen dialed back (4× instead of 7×)',
      'The Horde: XP penalty reduced — you keep 66% of XP per kill instead of 50%',
      'Entropy: equipment now degrades 4× as fast (up from 3×)',
      'Tempered Edge: physical resistance penalty increased to −40 (from −30)',
      'Pestilence: poison damage tuned down — Act 1 max reduced from 90 to 60, full table is now 45–60 / 55–75 / 65–90 / 75–105 / 85–120 across Acts 1–5',
      'Holy Shield caused the equipped shield to go invisible when randomized to any non-Paladin class — fixed',
      'Fixed golem synergy tooltips still showing the vanilla Necromancer skills (Blood Golem, Iron Golem, etc.) after shuffling',
    ],
  },
  {
    version: 'v0.241',
    date: 'May 2026',
    tagline: 'Controller fix — bind any shuffled skill to left trigger',
    notes: [
      'Controller players can now bind shuffled skills to the left trigger. Before, the game only let you put certain skills there, so a lot of cross-class skills (e.g. Fireball on a Barbarian) could only go on the right side. Auras are unchanged',
    ],
  },
  {
    version: 'v0.24',
    date: 'May 2026',
    tagline: 'Seed spoiler now shows the in-game skill names',
    notes: [
      'The seed spoiler preview now displays the names you actually see in-game. No more head-scratching at "Fire Trauma" — it shows up as "Fire Blast", "Shock Field" as "Shock Web", "Royal Strike" as "Phoenix Strike", "Wearwolf"/"Wearbear" as "Werewolf"/"Werebear", and so on',
      'Skill tooltips on the in-game skill tree now tag every shapeshift-usable skill with "Usable while Shapeshifted", so you can tell at a glance which randomized skills fire in werewolf/werebear form',
    ],
  },
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
