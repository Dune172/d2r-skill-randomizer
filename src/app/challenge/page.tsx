import type { Metadata } from 'next';
import Link from 'next/link';

export const revalidate = 3600;

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

// Base Monday: April 7, 2026 = Week 1
const BASE_DATE = new Date('2026-04-07T00:00:00Z');
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function getWeekSeed(weekNumber: number): number {
  return weekNumber * 31337;
}

function getWeekStart(weekNumber: number): Date {
  return new Date(BASE_DATE.getTime() + (weekNumber - 1) * WEEK_MS);
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

function getWeekData() {
  const now = new Date();
  const weekNumber = Math.max(1, Math.floor((now.getTime() - BASE_DATE.getTime()) / WEEK_MS) + 1);
  const currentSeed = getWeekSeed(weekNumber);
  const currentStart = getWeekStart(weekNumber);
  const currentEnd = new Date(currentStart.getTime() + WEEK_MS - 1);

  const archive = [];
  for (let i = weekNumber - 1; i >= Math.max(1, weekNumber - 4); i--) {
    const start = getWeekStart(i);
    const end = new Date(start.getTime() + WEEK_MS - 1);
    archive.push({ weekNumber: i, seed: getWeekSeed(i), start, end });
  }

  return { weekNumber, currentSeed, currentStart, currentEnd, archive };
}

export default function ChallengePage() {
  const { weekNumber, currentSeed, currentStart, currentEnd, archive } = getWeekData();

  const eventSchema = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: `D2R Randomizer Weekly Challenge — Week ${weekNumber}`,
    description: `This week's D2R Randomizer challenge seed is ${currentSeed}. Same seed for everyone — share your run in Discord.`,
    startDate: currentStart.toISOString(),
    endDate: currentEnd.toISOString(),
    url: 'https://d2rrandomizer.com/challenge',
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OnlineEventAttendanceMode',
    location: { '@type': 'VirtualLocation', url: 'https://d2rrandomizer.com/challenge' },
    organizer: { '@type': 'Organization', name: 'D2R Randomizer', url: 'https://d2rrandomizer.com' },
  };

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

        {/* Current challenge card */}
        <div className="border border-[#3a1510] bg-[#0c0304] panel-shadow p-8 mb-8">
          <p className="font-cinzel text-[11px] tracking-[0.4em] text-[#7a5818] uppercase mb-3">
            Week {weekNumber} &nbsp;·&nbsp; {formatDate(currentStart)} – {formatDate(currentEnd)}
          </p>
          <div className="font-cinzel font-black text-5xl md:text-6xl text-[#c8942a] glow-gold tracking-widest mb-6">
            {currentSeed.toLocaleString()}
          </div>
          <Link
            href={`/generate?seed=${currentSeed}`}
            className="inline-block font-cinzel tracking-[0.2em] uppercase text-sm px-8 py-3 bg-[#7a1f0a] hover:bg-[#9a2c0f] border border-[#c8942a]/40 text-[#e8c87a] transition-colors panel-shadow"
          >
            Generate This Seed
          </Link>
        </div>

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

      {/* Archive */}
      {archive.length > 0 && (
        <section className="max-w-2xl mx-auto px-4 pb-16">
          <h2 className="font-cinzel font-bold text-[#c8942a] tracking-[0.1em] uppercase text-base mb-5">
            Past Challenges
          </h2>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-[#3a1510]">
                <th className="text-left font-cinzel text-[10px] tracking-[0.3em] uppercase text-[#7a5818] pb-2 pr-4">Week</th>
                <th className="text-left font-cinzel text-[10px] tracking-[0.3em] uppercase text-[#7a5818] pb-2 pr-4">Dates</th>
                <th className="text-left font-cinzel text-[10px] tracking-[0.3em] uppercase text-[#7a5818] pb-2 pr-4">Seed</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {archive.map(({ weekNumber: wn, seed, start, end }) => (
                <tr key={wn} className="border-b border-[#1a0a06]">
                  <td className="py-2 pr-4 text-[#7a5818] font-cinzel text-xs">{wn}</td>
                  <td className="py-2 pr-4 text-[#a89060]/70 text-xs">{formatDate(start)} – {formatDate(end)}</td>
                  <td className="py-2 pr-4 text-[#c8942a] font-mono text-sm">{seed.toLocaleString()}</td>
                  <td className="py-2">
                    <Link
                      href={`/generate?seed=${seed}`}
                      className="font-cinzel text-[9px] tracking-[0.3em] uppercase text-[#7a5818] hover:text-[#a87830] transition-colors"
                    >
                      Play
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}
