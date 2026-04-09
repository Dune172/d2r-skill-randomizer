'use client';

import Link from 'next/link';
import Image from 'next/image';
import { getActivePair, type MutationDef } from '@/lib/mutations/registry';

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

function MutationCard({ mutation }: { mutation: MutationDef }) {
  const imgSrc = `/mutations/${mutation.id}.png`;
  return (
    <div className="group relative flex flex-col items-center border border-[#3a1510] bg-[#0c0304] panel-shadow p-4 w-40">
      {/* Image with emoji fallback */}
      <div className="w-24 h-24 flex items-center justify-center mb-3 overflow-hidden">
        <Image
          src={imgSrc}
          alt={mutation.name}
          width={96}
          height={96}
          className="object-contain"
          onError={(e) => {
            const target = e.currentTarget as HTMLImageElement;
            target.style.display = 'none';
            const fallback = target.nextElementSibling as HTMLElement | null;
            if (fallback) fallback.style.display = 'block';
          }}
        />
        <span className="text-5xl hidden" aria-hidden="true">{mutation.emoji}</span>
      </div>

      {/* Title */}
      <p className="font-cinzel font-bold text-[#c8942a] text-xs tracking-[0.1em] text-center leading-tight">
        {mutation.name}
      </p>

      {/* Hover tooltip */}
      <div
        className="invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-opacity duration-150
          absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-10
          w-56 border border-[#c8942a]/40 bg-[#0c0304]/95 p-3 text-xs text-[#a89060]/90
          leading-relaxed font-sans pointer-events-none"
      >
        {mutation.description}
        {/* Arrow */}
        <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[#c8942a]/40" />
      </div>
    </div>
  );
}

export function WeekCard() {
  const { weekNumber, currentSeed, currentStart, currentEnd } = getWeekData();
  const [mutA, mutB] = getActivePair(weekNumber);

  return (
    <div className="border border-[#3a1510] bg-[#0c0304] panel-shadow p-8 mb-8">
      <p className="font-cinzel text-[11px] tracking-[0.4em] text-[#7a5818] uppercase mb-3">
        Week {weekNumber} &nbsp;·&nbsp; {formatDate(currentStart)} – {formatDate(currentEnd)}
      </p>
      <div className="font-cinzel font-black text-5xl md:text-6xl text-[#c8942a] glow-gold tracking-widest mb-6">
        {currentSeed.toLocaleString()}
      </div>

      {/* Active mutations */}
      <div className="flex justify-center gap-4 mb-6">
        <MutationCard mutation={mutA} />
        <MutationCard mutation={mutB} />
      </div>

      <Link
        href={`/generate?seed=${currentSeed}`}
        className="inline-block font-cinzel tracking-[0.2em] uppercase text-sm px-8 py-3 bg-[#7a1f0a] hover:bg-[#9a2c0f] border border-[#c8942a]/40 text-[#e8c87a] transition-colors panel-shadow"
      >
        Generate This Seed
      </Link>
    </div>
  );
}

export function WeekArchive() {
  const { archive } = getWeekData();

  if (archive.length === 0) return null;

  return (
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
  );
}
