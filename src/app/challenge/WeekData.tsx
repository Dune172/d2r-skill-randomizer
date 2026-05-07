'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { getActivePair, getWeekName, type MutationDef } from '@/lib/mutations/registry';
import { InstallInstructions } from '@/app/components/InstallInstructions';
import { getCurrentWeekNumber, getWeekStart, getWeekEnd, getWeekSeed, formatWeekDate } from '@/lib/challenge/week';
import { ChallengeGenerator } from './ChallengeGenerator';
import { Leaderboard } from '@/app/components/Leaderboard';
import { SubmitRunForm } from '@/app/components/SubmitRunForm';
import SkillTreePreview from '@/components/SkillTreePreview';
import type { PreviewData } from '@/lib/randomizer/types';

function getWeekData() {
  const weekNumber = getCurrentWeekNumber();
  const currentSeed = getWeekSeed(weekNumber);
  const currentStart = getWeekStart(weekNumber);
  const currentEnd = getWeekEnd(weekNumber);

  return { weekNumber, currentSeed, currentStart, currentEnd };
}

function CountdownTimer({ nextWeekStart }: { nextWeekStart: Date }) {
  const [remaining, setRemaining] = useState(() => nextWeekStart.getTime() - Date.now());

  useEffect(() => {
    const id = setInterval(() => {
      setRemaining(nextWeekStart.getTime() - Date.now());
    }, 1000);
    return () => clearInterval(id);
  }, [nextWeekStart]);

  if (remaining <= 0) {
    return (
      <p className="font-mono text-[#c8942a] text-sm tracking-widest">
        New challenge available — refresh the page!
      </p>
    );
  }

  const days = Math.floor(remaining / (1000 * 60 * 60 * 24));
  const hours = Math.floor((remaining / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((remaining / (1000 * 60)) % 60);

  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <p className="font-mono text-[#9a7a2a] text-sm tracking-widest">
      {days > 0 && <>{days}d </>}{pad(hours)}h {pad(minutes)}m
    </p>
  );
}

function SettingItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center py-2.5 border-t border-[#3a1510]/45">
      <p className="font-cinzel text-[10px] tracking-[0.32em] uppercase text-[#9a7a2a] mb-1">
        {label}
      </p>
      <p className="text-[#c8a870] text-sm leading-snug">{value}</p>
    </div>
  );
}

function MutationCard({ mutation }: { mutation: MutationDef }) {
  const [expanded, setExpanded] = useState(false);
  const imgSrc = `/mutations/${mutation.id}.webp`;
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

export function WeekCard() {
  const { weekNumber, currentSeed, currentStart, currentEnd } = getWeekData();
  const [mutA, mutB] = getActivePair(weekNumber);
  const weekName = getWeekName(weekNumber);
  const [generated, setGenerated] = useState(false);
  const [leaderboardKey, setLeaderboardKey] = useState(0);
  const [preview, setPreview] = useState<PreviewData | null>(null);

  return (
    <>
    <div className="card-ornate border border-t-2 border-[#3a1510] border-t-[#c8942a]/30 bg-[#0c0304] panel-shadow shadow-[inset_0_1px_0_rgba(200,148,42,0.15)] p-8 mb-8 max-w-2xl mx-auto">
      <p className="font-cinzel text-xs tracking-[0.4em] text-[#9a7a2a] uppercase mb-3">
        Week {weekNumber} &nbsp;·&nbsp; {formatWeekDate(currentStart)} – {formatWeekDate(currentEnd)}
      </p>
      <div className="font-cinzel font-black text-5xl md:text-6xl text-[#c8942a] glow-pulse tracking-widest mb-2">
        {weekName}
      </div>
      <div className="mb-6">
        <CountdownTimer nextWeekStart={getWeekStart(weekNumber + 1)} />
      </div>

      {/* Active mutations */}
      <div className="w-full border-t border-[#3a1510]/50 mt-2 pt-5 mb-6">
        <p className="font-cinzel text-xs tracking-[0.4em] text-[#9a7a2a] uppercase text-center mb-4">
          Mutations
        </p>
        <div className="flex flex-wrap justify-center gap-4 mb-3">
          <MutationCard mutation={mutA} />
          <MutationCard mutation={mutB} />
        </div>
        <p className="text-xs text-[#9a7a2a] tracking-wider text-center hidden md:block">
          Hover for details
        </p>
      </div>

      {/* Challenge settings */}
      <div className="w-full border-t border-[#3a1510]/50 mt-2 pt-5 mb-10">
        <p className="font-cinzel text-xs tracking-[0.4em] text-[#9a7a2a] uppercase text-center mb-5">
          Challenge Settings
        </p>
        <div className="max-w-md mx-auto grid grid-cols-1 sm:grid-cols-2 gap-x-10">
          <SettingItem label="XP Boost" value="1.5× · Acts I–II" />
          <SettingItem label="Teleport Staff" value="Lvl 18 · Corpsefire" />
          <SettingItem label="Merc Auras" value="Enabled" />
          <SettingItem label="Prerequisites" value="Standard" />
        </div>
      </div>

      <ChallengeGenerator seed={currentSeed} weekNumber={weekNumber} onReady={() => setGenerated(true)} onPreview={setPreview} />

      {/* Leaderboard — ember-warm crimson card to set apart from the parchment-cold main panel */}
      <div className="w-full mt-10">
        <div
          className="relative border border-[#5a1f1a] border-t-2 border-t-[#a83830]/45
            bg-gradient-to-b from-[#1a0808] to-[#0c0304]
            shadow-[inset_0_1px_0_rgba(200,80,60,0.18),0_0_28px_rgba(180,70,50,0.06)]
            p-6"
        >
          <p className="font-cinzel text-xs tracking-[0.4em] text-[#d8784a] uppercase text-center mb-2">
            Leaderboard
          </p>
          <p className="text-xs text-[#9a5a3a] tracking-wider text-center mb-5">
            Fastest time to beat Baal on Normal · top 3 shown
          </p>
          <div className="mb-5">
            <Leaderboard weekNumber={weekNumber} refreshKey={leaderboardKey} expandable />
          </div>
          <SubmitRunForm weekNumber={weekNumber} onSubmitted={() => setLeaderboardKey((k) => k + 1)} />
        </div>
      </div>
    </div>

    {preview && (
      <div className="mx-[calc(50%-50vw)] mb-8">
        <div className="max-w-7xl mx-auto px-4 text-left">
          <SkillTreePreview data={preview} />
        </div>
      </div>
    )}

    {generated && (
      <div className="anim-fade-up max-w-4xl mx-auto mb-8 text-left">
        <div className="border-t border-[#3a1510]/50 pt-5 mb-4">
          <p className="font-cinzel text-xs tracking-[0.4em] text-[#9a7a2a] uppercase text-center mb-4">
            Install Instructions
          </p>
        </div>
        <InstallInstructions seed={currentSeed} />
      </div>
    )}
    </>
  );
}

