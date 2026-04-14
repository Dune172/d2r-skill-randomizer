'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { getActivePair, getWeekName, type MutationDef } from '@/lib/mutations/registry';

const BASE_DATE = new Date('2026-04-13T00:00:00Z');
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Season Beta Race preset — same settings as the randomizer's season1race preset
const SEASON1_OPTIONS = {
  enablePrereqs: true,
  playersEnabled: true,
  playersCount: 2,
  playersActs: [4, 5],
  startingItems: {
    teleportStaff: true,
    teleportStaffLevel: 6,
    teleportStaffDropSource: 'Corpsefire',
    horadricCube: true,
  },
  hirelingAura: true,
  disableChat: true,
  xpMultiplier: 3,
  xpActs: [1, 2, 3],
};

function getWeekSeed(weekNumber: number): number {
  return weekNumber * 1337;
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

function SettingItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="font-cinzel text-xs tracking-[0.2em] uppercase text-[#9a7a2a]">{label}</span>
      <p className="text-[#a89060] text-sm">{value}</p>
    </div>
  );
}

function MutationCard({ mutation }: { mutation: MutationDef }) {
  const [expanded, setExpanded] = useState(false);
  const imgSrc = `/mutations/${mutation.id}.png`;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => setExpanded((e) => !e)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded((v) => !v); } }}
      className="card-ornate group relative flex flex-col items-center border border-[#3a1510] bg-[#0c0304] panel-shadow p-4 w-48 cursor-pointer
        hover:-translate-y-1 hover:border-[#c8942a]/50 hover:shadow-[0_0_24px_rgba(200,148,42,0.12)]
        transition-all duration-200 select-none">
      <div className="w-40 h-40 flex items-center justify-center mb-3 overflow-hidden">
        <Image
          src={imgSrc}
          alt={mutation.name}
          width={160}
          height={160}
          className="object-contain group-hover:opacity-90 transition-opacity duration-200"
          onError={(e) => {
            const target = e.currentTarget as HTMLImageElement;
            target.style.display = 'none';
            const fallback = target.nextElementSibling as HTMLElement | null;
            if (fallback) fallback.style.display = 'block';
          }}
        />
        <span className="text-5xl hidden" aria-hidden="true">{mutation.emoji}</span>
      </div>
      <p className="font-cinzel font-bold text-[#c8942a] text-sm tracking-[0.1em] text-center leading-tight">
        {mutation.name}
      </p>
      <p className="text-xs text-[#9a7a2a] mt-1 tracking-wider hidden md:block">
        Hover for details
      </p>
      <p className="text-xs text-[#a89060] leading-relaxed mt-2 md:hidden">
        {mutation.description}
      </p>
      <div
        className={`${expanded ? 'md:visible md:opacity-100' : 'invisible opacity-0'} md:group-hover:visible md:group-hover:opacity-100 transition-opacity duration-150
          hidden md:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-10
          w-56 border border-[#c8942a]/40 bg-[#0c0304]/95 p-3 text-xs text-[#a89060]
          leading-relaxed font-sans pointer-events-none`}
      >
        {mutation.description}
        <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[#c8942a]/40" />
      </div>
    </div>
  );
}

type GenStatus = 'idle' | 'generating' | 'ready' | 'error';

function ChallengeGenerator({ seed, weekNumber }: { seed: number; weekNumber: number }) {
  const [status, setStatus] = useState<GenStatus>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const downloadUrl =
    `/api/download?seed=${seed}` +
    `&players=${SEASON1_OPTIONS.playersCount}` +
    `&acts=${SEASON1_OPTIONS.playersActs.join(',')}` +
    `&teleportStaff=${SEASON1_OPTIONS.startingItems.teleportStaffLevel}` +
    `&dropSource=${SEASON1_OPTIONS.startingItems.teleportStaffDropSource}` +
    `&cube=1` +
    `&disableChat=1` +
    `&xpMultiplier=${SEASON1_OPTIONS.xpMultiplier}` +
    `&xpActs=${SEASON1_OPTIONS.xpActs.join(',')}` +
    `&weekly=1`;

  const handleGenerate = async () => {
    setStatus('generating');
    setErrorMsg('');
    try {
      const res = await fetch('/api/randomize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seed,
          ...SEASON1_OPTIONS,
          weeklyChallenge: { enabled: true },
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Generation failed');
      }
      setStatus('ready');
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  if (status === 'ready') {
    return (
      <a
        href={downloadUrl}
        className="btn-shimmer inline-block font-cinzel tracking-[0.2em] uppercase text-sm px-8 py-3
          bg-gradient-to-b from-[#121838] to-[#0a1028]
          border border-[#283878] text-[#c8d8f8]
          hover:from-[#1a2448] hover:to-[#101830] hover:border-[#4858c0]
          transition-colors panel-shadow"
      >
        Download Zip
      </a>
    );
  }

  if (status === 'error') {
    return (
      <div className="space-y-3">
        <p className="text-sm text-red-400">{errorMsg || 'Something went wrong.'}</p>
        <button
          onClick={handleGenerate}
          className="btn-shimmer inline-block font-cinzel tracking-[0.2em] uppercase text-sm px-8 py-3 bg-[#7a1f0a] hover:bg-[#9a2c0f] border border-[#c8942a]/40 text-[#e8c87a] transition-colors panel-shadow"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={handleGenerate}
      disabled={status === 'generating'}
      className="btn-shimmer inline-block font-cinzel tracking-[0.2em] uppercase text-sm px-8 py-3 bg-[#7a1f0a] hover:bg-[#9a2c0f] border border-[#c8942a]/40 text-[#e8c87a] transition-colors panel-shadow disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {status === 'generating' ? 'Generating…' : 'Generate This Seed'}
    </button>
  );
}

export function WeekCard() {
  const { weekNumber, currentSeed, currentStart, currentEnd } = getWeekData();
  const [mutA, mutB] = getActivePair(weekNumber);
  const weekName = getWeekName(weekNumber);

  return (
    <div className="card-ornate border border-t-2 border-[#3a1510] border-t-[#c8942a]/30 bg-[#0c0304] panel-shadow shadow-[inset_0_1px_0_rgba(200,148,42,0.15)] p-8 mb-8">
      <p className="font-cinzel text-xs tracking-[0.4em] text-[#9a7a2a] uppercase mb-3">
        Week {weekNumber} &nbsp;·&nbsp; {formatDate(currentStart)} – {formatDate(currentEnd)}
      </p>
      <div className="font-cinzel font-black text-5xl md:text-6xl text-[#c8942a] glow-pulse tracking-widest mb-2">
        {weekName}
      </div>
      <p className="font-mono text-[#9a7a2a] text-sm tracking-widest mb-6">
        <span className="text-[#7a5818] mr-1">SEED</span>{currentSeed.toLocaleString()}
      </p>

      {/* Active mutations */}
      <div className="flex flex-wrap justify-center gap-4 mb-6">
        <MutationCard mutation={mutA} />
        <MutationCard mutation={mutB} />
      </div>

      {/* Challenge settings */}
      <div className="w-full border-t border-[#3a1510]/50 mt-2 pt-5 mb-6">
        <p className="font-cinzel text-xs tracking-[0.4em] text-[#9a7a2a] uppercase text-center mb-3">
          Challenge Settings
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-left max-w-md mx-auto">
          <SettingItem label="Players" value="/players 2 (Acts IV-V)" />
          <SettingItem label="XP Boost" value="3x (Acts I-III)" />
          <SettingItem label="Teleport Staff" value="Lvl 6, from Corpsefire" />
          <SettingItem label="Horadric Cube" value="Starts in inventory" />
          <SettingItem label="Merc Auras" value="Enabled" />
          <SettingItem label="Prerequisites" value="Standard" />
        </div>
      </div>

      <ChallengeGenerator seed={currentSeed} weekNumber={weekNumber} />
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
            <th className="text-left font-cinzel text-xs tracking-[0.3em] uppercase text-[#9a7a2a] pb-2 pr-4">Week</th>
            <th className="text-left font-cinzel text-xs tracking-[0.3em] uppercase text-[#9a7a2a] pb-2 pr-4">Name</th>
            <th className="text-left font-cinzel text-xs tracking-[0.3em] uppercase text-[#9a7a2a] pb-2 pr-4">Dates</th>
            <th className="pb-2" />
          </tr>
        </thead>
        <tbody>
          {archive.map(({ weekNumber: wn, seed, start, end }) => (
            <tr key={wn} className="border-b border-[#1a0a06] hover:bg-[#c8942a]/[0.03] transition-colors duration-150">
              <td className="py-2 pr-4 text-[#9a7a2a] font-cinzel text-sm">{wn}</td>
              <td className="py-2 pr-4 text-[#c8942a] font-cinzel text-sm">{getWeekName(wn)}</td>
              <td className="py-2 pr-4 text-[#a89060] text-sm">{formatDate(start)} – {formatDate(end)}</td>
              <td className="py-2">
                <Link
                  href={`/generate?seed=${seed}`}
                  className="font-cinzel text-xs tracking-[0.3em] uppercase text-[#9a7a2a] hover:text-[#c8942a] transition-colors"
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
