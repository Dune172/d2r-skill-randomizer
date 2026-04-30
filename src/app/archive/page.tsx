import type { Metadata } from 'next';
import Link from 'next/link';
import { getCurrentWeekNumber } from '@/lib/challenge/week';
import { getEntries, stripIp } from '@/lib/leaderboard';
import { ArchiveWeekCard } from './ArchiveWeekCard';
import { KofiPopup } from './KofiPopup';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'D2R Weekly Challenge Archive',
  description:
    'Play any past D2R Randomizer weekly challenge. Every weekly seed and mutation set since launch, available on demand.',
  alternates: {
    canonical: '/archive',
  },
  openGraph: {
    title: 'D2R Weekly Challenge Archive',
    description: 'Play any past D2R Randomizer weekly challenge. Every weekly seed and mutation set since launch, available on demand.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'D2R Weekly Challenge Archive',
    description: 'Play any past D2R Randomizer weekly challenge. Every weekly seed and mutation set since launch, available on demand.',
  },
};

export default function ArchivePage() {
  const currentWeek = getCurrentWeekNumber();
  const pastWeeks = Array.from({ length: Math.max(0, currentWeek - 1) }, (_, i) => currentWeek - 1 - i);

  return (
    <main className="min-h-screen">
      <KofiPopup />
      <section className="max-w-4xl mx-auto px-4 pt-12 pb-6 text-center">
        <h1 className="anim-fade-up font-cinzel font-black tracking-[0.14em] text-3xl md:text-4xl text-[#c8942a] glow-gold uppercase mb-3">
          Weekly Challenge Archive
        </h1>
        <div className="anim-fade-up-d1 flex items-center gap-3 justify-center mb-8">
          <div className="flex-1 h-px bg-gradient-to-r from-transparent to-[#7a5818]/60 max-w-[80px]" />
          <h2 className="font-cinzel text-sm text-[#c8942a] tracking-[0.12em] uppercase">
            Every Past Challenge
          </h2>
          <div className="flex-1 h-px bg-gradient-to-l from-transparent to-[#7a5818]/60 max-w-[80px]" />
        </div>

        <p className="anim-fade-up-d2 text-[#a89060] text-sm leading-relaxed max-w-lg mx-auto mb-10">
          Play any past weekly challenge — same seed, same settings, same mutations as the week it was live.
        </p>
      </section>

      <section className="max-w-4xl mx-auto px-4 pb-16">
        {pastWeeks.length === 0 ? (
          <div className="card-ornate border border-[#3a1510] bg-[#0c0304] panel-shadow p-8 max-w-xl mx-auto text-center">
            <p className="text-[#a89060] text-sm leading-relaxed">
              No past challenges yet — come back next Monday.
            </p>
            <Link
              href="/challenge"
              className="font-cinzel tracking-[0.2em] uppercase text-xs px-6 py-2.5
                bg-gradient-to-b from-[#121838] to-[#0a1028]
                border border-[#283878] text-[#c8d8f8]
                hover:from-[#1a2448] hover:to-[#101830] hover:border-[#4858c0]
                transition-colors panel-shadow inline-block mt-5"
            >
              View This Week&apos;s Challenge
            </Link>
          </div>
        ) : (
          <div className="anim-fade-up-d3 space-y-8">
            {pastWeeks.map((week) => (
              <ArchiveWeekCard
                key={week}
                weekNumber={week}
                entries={getEntries(week).map(stripIp)}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
