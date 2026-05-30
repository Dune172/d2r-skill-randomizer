import Link from 'next/link';
import { getCurrentWeekNumber } from '@/lib/challenge/week';
import { HomeChallengeCard } from '@/app/components/HomeChallengeCard';

// Force dynamic rendering so the weekly challenge card always reflects the
// current week from the server's NTP-synced clock. ISR caching can serve a
// pre-deploy render after WEEK_NAMES is reordered, and any client-side
// recompute would depend on the user's machine clock — both cause the wrong
// week's name to appear. Server SSR per-request avoids both classes of bug.
// Legacy `?seed=` shared links are handled by middleware (see
// src/middleware.ts) before this page renders.
export const dynamic = 'force-dynamic';

const softwareSchema = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'D2R Randomizer',
  description: 'Free skill randomizer mod for Diablo 2 Resurrected. Shuffles all 8 class skill trees for unique playthroughs.',
  url: 'https://d2rrandomizer.com',
  applicationCategory: 'GameApplication',
  operatingSystem: 'Windows',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  downloadUrl: 'https://d2rrandomizer.com/generate',
  screenshot: 'https://d2rrandomizer.com/og-image.png',
};

const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'Is D2R Randomizer safe for Battle.net?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes. D2R Randomizer is an offline-only mod. It does not affect your Battle.net account or online characters in any way. Only use it in single-player or offline mode.',
      },
    },
    {
      '@type': 'Question',
      name: 'What does the D2R Randomizer shuffle?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'The randomizer shuffles all 8 class skill trees — Sorceress, Necromancer, Amazon, Paladin, Barbarian, Druid, Assassin, and Warlock. Each seed moves entire skill trees between classes, reassigns synergies, and adjusts prerequisites.',
      },
    },
    {
      '@type': 'Question',
      name: 'How do seeds work?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'A seed is a number that determines which skill trees each class receives. The same seed always produces the same result. You can share a seed with friends so everyone plays the same randomized version.',
      },
    },
    {
      '@type': 'Question',
      name: 'Does D2R Randomizer work with other mods?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'D2R Randomizer generates a standalone mod ZIP. It can conflict with other mods that modify the same game files (skills.txt, skilldesc.txt). Running it alongside large overhaul mods is not supported.',
      },
    },
  ],
};

const features = [
  {
    icon: '⚔',
    title: '8 Class Trees Shuffled',
    desc: 'Every skill tree from all eight classes gets redistributed. Your Sorceress might cast Barbarian war cries or your Necromancer might wield Amazon bows.',
  },
  {
    icon: '🧬',
    title: 'Full Synergy Remap',
    desc: 'Synergy formulas are recalculated for every shuffled tree. Nothing breaks.',
  },
  {
    icon: '🔗',
    title: 'Prerequisite Logic',
    desc: 'Prerequisites are reassigned by grid position so skill progression always makes sense — no dead-end paths.',
  },
  {
    icon: '🔢',
    title: 'Shareable Seeds',
    desc: 'Every seed is deterministic. Share a number with friends and everyone gets the exact same randomized trees.',
  },
  {
    icon: '🛡',
    title: 'Works Offline Only',
    desc: 'Completely safe for your Battle.net account. The mod runs in single-player or offline mode — it never touches online characters.',
  },
  {
    icon: '⚡',
    title: 'One-Click Download',
    desc: 'Enter a seed, click generate. Download a ready-to-install mod ZIP in seconds. No tools or manual editing required.',
  },
];

const communityCards = [
  {
    href: 'https://discord.gg/y5r2sTxwS5',
    external: true,
    label: 'Discord',
    desc: 'Share runs, compare seeds, and find co-op partners in the community.',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
        <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z" />
      </svg>
    ),
  },
  {
    href: 'https://patreon.com/D2RR?utm_medium=unknown&utm_source=join_link&utm_campaign=creatorshare_creator&utm_content=copyLink',
    external: true,
    label: 'Patreon',
    desc: 'Enjoying the randomizer? Support development and keep the seeds flowing.',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
        <path d="M15.386.524c-4.764 0-8.64 3.876-8.64 8.64 0 4.75 3.876 8.613 8.64 8.613 4.75 0 8.614-3.864 8.614-8.613C24 4.4 20.136.524 15.386.524M.003 23.537h4.22V.524H.003" />
      </svg>
    ),
  },
  {
    href: '/changelog',
    external: false,
    label: 'Patch Notes',
    desc: 'See what changed in each version and follow ongoing randomizer development.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25Z" />
      </svg>
    ),
  },
];

export default function Home() {
  const weekNumber = getCurrentWeekNumber();

  return (
    <main className="min-h-screen">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />

      {/* ── Hero ── */}
      <section className="max-w-4xl mx-auto px-4 pt-16 pb-10 text-center">
        <h1 className="font-cinzel font-black tracking-[0.14em] text-4xl md:text-6xl text-[#c8942a] glow-gold uppercase mb-3">
          D2R Randomizer
        </h1>
        <h2 className="font-cinzel text-sm md:text-base text-[#a87830] tracking-[0.06em] mb-6">
          A Free Skill Randomizer Mod for Diablo 2: Resurrected
        </h2>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
          <Link
            href="/generate"
            className="font-cinzel tracking-[0.2em] uppercase text-sm px-10 py-3.5 bg-[#7a1f0a] hover:bg-[#9a2c0f] border border-[#c8942a]/40 text-[#e8c87a] transition-colors panel-shadow"
          >
            Generate Your Mod
          </Link>
          <Link
            href="/challenge"
            className="font-cinzel tracking-[0.2em] uppercase text-sm px-10 py-3.5 bg-transparent hover:bg-[#1a0a06] border border-[#c8942a]/30 text-[#a87830] hover:text-[#c8942a] transition-colors"
          >
            This Week&apos;s Challenge
          </Link>
        </div>

        {/* Offline-safe note */}
        <p className="text-[#7a5818] text-xs font-cinzel tracking-[0.2em] uppercase">
          Offline only &nbsp;·&nbsp; Safe for Battle.net &nbsp;·&nbsp; Free
        </p>
      </section>

      {/* ── Divider ── */}
      <div className="flex items-center gap-3 max-w-5xl mx-auto px-4 mb-12">
        <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[#7a5818] to-[#c8942a]" />
        <span className="text-[#c8942a] text-xs">◆</span>
        <div className="flex-1 h-px bg-gradient-to-l from-transparent via-[#7a5818] to-[#c8942a]" />
      </div>

      {/* ── Feature Grid ── */}
      <section className="max-w-5xl mx-auto px-4 mb-14">
        <h2 className="font-cinzel font-bold text-[#c8942a] tracking-[0.15em] uppercase text-xs text-center mb-8">
          What Gets Randomized
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map((f) => (
            <div
              key={f.title}
              className="border border-[#3a1510] bg-[#0c0304] p-5 panel-shadow feature-card transition-colors group"
            >
              <div className="text-2xl mb-3 text-[#c8942a]">{f.icon}</div>
              <h3 className="font-cinzel font-bold text-[#e8c87a] text-sm tracking-[0.08em] mb-2">
                {f.title}
              </h3>
              <p className="text-[#a89060]/75 text-xs leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Challenge + Community (two-column on desktop) ── */}
      <section className="max-w-5xl mx-auto px-4 mb-14 grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* This Week's Challenge */}
        <HomeChallengeCard weekNumber={weekNumber} />

        {/* Community Cards */}
        <div className="flex flex-col gap-3">
          <p className="font-cinzel font-bold text-[#c8942a] tracking-[0.1em] uppercase text-base mb-1">
            Community
          </p>
          {communityCards.map((c) => {
            const cardClasses =
              'flex-1 border border-[#3a1510] bg-[#0c0304] p-4 panel-shadow feature-card transition-colors flex items-center gap-4';
            const children = (
              <>
                <div className="text-[#c8942a] shrink-0">{c.icon}</div>
                <div>
                  <p className="font-cinzel font-bold text-[#e8c87a] text-sm tracking-[0.06em] mb-1">{c.label}</p>
                  <p className="text-[#a89060]/70 text-xs leading-relaxed">{c.desc}</p>
                </div>
              </>
            );
            return c.external ? (
              <a key={c.href} href={c.href} target="_blank" rel="noopener noreferrer" className={cardClasses}>
                {children}
              </a>
            ) : (
              <Link key={c.href} href={c.href} className={cardClasses}>
                {children}
              </Link>
            );
          })}
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="relative max-w-3xl mx-auto px-4 pb-20">
        <h2 className="font-cinzel font-bold text-[#c8942a] tracking-[0.1em] uppercase text-lg mb-6">
          Frequently Asked Questions
        </h2>
        <div className="space-y-5">
          {faqSchema.mainEntity.map((item) => (
            <div key={item.name} className="border-l-2 border-[#3a1510] pl-4">
              <p className="font-semibold text-[#e8d5a0] text-sm mb-1">{item.name}</p>
              <p className="text-[#a89060]/80 text-sm leading-relaxed">{item.acceptedAnswer.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Fade to black before footer */}
      <div className="h-24 bg-gradient-to-b from-transparent to-[#060203] pointer-events-none" />
    </main>
  );
}
