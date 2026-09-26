// TEMPORARY — pre-release preview of the October 2026 challenge (Return to Tristram).
// Delete this folder (and the WeekCard `weekNumber` prop if unused) before/after launch.
import type { Metadata } from 'next';
import { WeekCard } from '../WeekData';
import { OCTOBER_2026_CHALLENGE } from '@/lib/challenge/week';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'October Challenge Preview (internal)',
  robots: { index: false, follow: false },
};

export default function OctoberPreviewPage() {
  return (
    <main className="min-h-screen">
      <div className="sticky top-0 z-50 bg-[#5a1f1a] border-b border-[#d8482e]/60 text-center py-2 px-4">
        <p className="font-cinzel text-xs tracking-[0.3em] uppercase text-[#f0c8a0]">
          Internal preview · Challenge {OCTOBER_2026_CHALLENGE} · not linked, not indexed
        </p>
        <p className="text-[11px] text-[#d8a080] mt-0.5">
          Countdown shows time until November. Leaderboard submissions are rejected until Oct 1.
        </p>
      </div>
      <section className="max-w-4xl mx-auto px-4 pt-12 pb-6 text-center">
        <h1 className="font-cinzel font-black tracking-[0.14em] text-3xl md:text-4xl text-[#c8942a] glow-gold uppercase mb-8">
          D2R Mutation Challenge
        </h1>
        <WeekCard weekNumber={OCTOBER_2026_CHALLENGE} />
      </section>
    </main>
  );
}
