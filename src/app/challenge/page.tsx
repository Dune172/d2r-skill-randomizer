import type { Metadata } from 'next';
import { WeekCard, WeekArchive } from './WeekData';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'D2R Weekly Challenge Seed',
  description:
    "Play this week's D2R Randomizer challenge seed. A new Diablo 2 Resurrected randomizer seed every Monday — same settings for everyone.",
  alternates: {
    canonical: '/challenge',
  },
  openGraph: {
    title: 'D2R Weekly Challenge Seed',
    description: "Play this week's D2R Randomizer challenge seed. A new Diablo 2 Resurrected randomizer seed every Monday — same settings for everyone.",
  },
  twitter: {
    card: 'summary_large_image',
    title: 'D2R Weekly Challenge Seed',
    description: "Play this week's D2R Randomizer challenge seed. A new Diablo 2 Resurrected randomizer seed every Monday — same settings for everyone.",
  },
};

const eventSchema = {
  '@context': 'https://schema.org',
  '@type': 'Event',
  name: 'D2R Randomizer Weekly Challenge',
  description: 'A new D2R Randomizer challenge seed every Monday — same seed for everyone.',
  url: 'https://d2rrandomizer.com/challenge',
  eventStatus: 'https://schema.org/EventScheduled',
  eventAttendanceMode: 'https://schema.org/OnlineEventAttendanceMode',
  location: { '@type': 'VirtualLocation', url: 'https://d2rrandomizer.com/challenge' },
  organizer: { '@type': 'Organization', name: 'D2R Randomizer', url: 'https://d2rrandomizer.com' },
};

export default function ChallengePage() {
  return (
    <main className="min-h-screen">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(eventSchema) }}
      />

      <section className="max-w-2xl mx-auto px-4 pt-12 pb-6 text-center">
        <h1 className="font-cinzel font-black tracking-[0.14em] text-3xl md:text-4xl text-[#c8942a] glow-gold uppercase mb-3">
          D2R Weekly Challenge
        </h1>
        <h2 className="font-cinzel text-base text-[#a87830] tracking-[0.08em] mb-8">
          This Week&apos;s Randomizer Seed
        </h2>

        <WeekCard />

        <p className="text-[#a89060]/70 text-sm leading-relaxed max-w-lg mx-auto mb-10">
          A new challenge seed drops every Monday. Everyone plays the same Diablo 2 Resurrected
          randomizer — same seed, same settings. Share your run and compare results in{' '}
          <a
            href="https://discord.gg/y5r2sTxwS5"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#a87830] hover:text-[#c8942a] transition-colors"
          >
            the Discord
          </a>
          .
        </p>
      </section>

      {/* About the challenge */}
      <section className="max-w-2xl mx-auto px-4 mb-10 text-left space-y-4 text-sm text-[#a89060]/80 leading-relaxed">
        <p>
          The D2R Randomizer Weekly Challenge is a community event that runs every week. Each Monday
          a new seed is selected and posted here. Every player who generates that seed gets the exact
          same randomized skill tree layout — the same classes, the same synergies, the same
          prerequisites — so results are directly comparable across the community.
        </p>
        <p>
          Challenge runs are played in offline single-player mode using the D2R Randomizer mod. The
          default challenge settings use standard prerequisites and normal weapon logic, so every
          participant starts on equal footing. Whether you race to Hell, push for the highest
          completion, or just try a class you&apos;ve never played before, the weekly seed is a
          shared experience that gives the whole community something to talk about.
        </p>
      </section>

      {/* Divider */}
      <div className="flex items-center gap-3 max-w-2xl mx-auto px-4 mb-8">
        <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[#7a5818] to-[#c8942a]" />
        <span className="text-[#c8942a] text-xs">◆</span>
        <div className="flex-1 h-px bg-gradient-to-l from-transparent via-[#7a5818] to-[#c8942a]" />
      </div>

      <WeekArchive />
    </main>
  );
}
