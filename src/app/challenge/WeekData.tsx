'use client';

import Link from 'next/link';

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

export function WeekCard() {
  const { weekNumber, currentSeed, currentStart, currentEnd } = getWeekData();

  return (
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
