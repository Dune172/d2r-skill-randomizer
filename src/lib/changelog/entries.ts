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
