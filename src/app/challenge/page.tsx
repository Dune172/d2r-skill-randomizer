import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { WeekCard, WeekArchive } from './WeekData';

function Step({ number, text }: { number: number; text: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full border border-[#c8942a] text-[#c8942a] text-[10px] font-bold flex-shrink-0 mt-0.5">
        {number}
      </span>
      <p className="text-sm text-[#a89060]/80 leading-relaxed">{text}</p>
    </div>
  );
}

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
        <h1 className="anim-fade-up font-cinzel font-black tracking-[0.14em] text-3xl md:text-4xl text-[#c8942a] glow-gold uppercase mb-3">
          D2R Weekly Challenge
        </h1>
        <div className="anim-fade-up-d1 flex items-center gap-3 justify-center mb-8">
          <div className="flex-1 h-px bg-gradient-to-r from-transparent to-[#7a5818]/60 max-w-[80px]" />
          <h2 className="font-cinzel text-sm text-[#a87830] tracking-[0.12em] uppercase">
            This Week&apos;s Randomizer Seed
          </h2>
          <div className="flex-1 h-px bg-gradient-to-l from-transparent to-[#7a5818]/60 max-w-[80px]" />
        </div>

        <div className="anim-fade-up-d2">
          <WeekCard />
        </div>

        <p className="anim-fade-up-d3 text-[#a89060]/70 text-sm leading-relaxed max-w-lg mx-auto mb-10">
          A new challenge seed drops every Monday. Everyone plays the same randomized Diablo 2 Resurrected
          experience — same seed, same settings, same starting point.
        </p>
      </section>

      {/* How It Works */}
      <section className="max-w-2xl mx-auto px-4 mb-10">
        <h3 className="font-cinzel text-[10px] tracking-[0.4em] text-[#7a5818] uppercase text-center mb-5">
          How It Works
        </h3>
        <div className="space-y-4 max-w-lg mx-auto">
          <Step number={1} text="A new seed is posted every Monday. Generate the mod and install it." />
          <Step number={2} text="Everyone plays the same randomized skill trees — same seed, same settings, same starting point." />
          <Step
            number={3}
            text={
              <>
                Share your run in{' '}
                <a
                  href="https://discord.gg/y5r2sTxwS5"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#a87830] hover:text-[#c8942a] transition-colors"
                >
                  the Discord
                </a>
                . Compare results, race to Hell, or just explore.
              </>
            }
          />
        </div>
        <p className="text-[#a89060]/50 text-xs leading-relaxed mt-5 text-center max-w-md mx-auto">
          Played in offline single-player using the D2R Randomizer mod. Standard prerequisites and normal weapon logic apply.
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
