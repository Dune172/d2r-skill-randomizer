'use client';

import { useState } from 'react';
import { getActivePair, getWeekName } from '@/lib/mutations/registry';
import { getWeekStart, getWeekEnd, getWeekSeed, formatWeekDate } from '@/lib/challenge/week';
import { HomeMutationCard } from '@/app/components/HomeMutationCard';
import { ChallengeGenerator } from '@/app/challenge/ChallengeGenerator';

export function ArchiveWeekCard({ weekNumber }: { weekNumber: number }) {
  const weekName = getWeekName(weekNumber);
  const [mutA, mutB] = getActivePair(weekNumber);
  const seed = getWeekSeed(weekNumber);
  const start = getWeekStart(weekNumber);
  const end = getWeekEnd(weekNumber);
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="card-ornate border border-[#3a1510] bg-[#0c0304] panel-shadow shadow-[inset_0_1px_0_rgba(200,148,42,0.08)] max-w-xl mx-auto text-center hover:border-[#c8942a]/40 transition-colors">
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        aria-expanded={expanded}
        aria-controls={`archive-week-${weekNumber}-body`}
        className="w-full p-6 cursor-pointer flex flex-col items-center"
      >
        <p className="font-cinzel text-[10px] tracking-[0.4em] text-[#7a5818] uppercase mb-3">
          Week {weekNumber} &nbsp;·&nbsp; {formatWeekDate(start)} – {formatWeekDate(end)}
        </p>
        <div className="flex items-center justify-center gap-3">
          <div className="font-cinzel font-black text-3xl md:text-4xl text-[#c8942a] glow-gold tracking-[0.12em] uppercase leading-tight">
            {weekName}
          </div>
          <span
            aria-hidden="true"
            className={`font-cinzel text-[#7a5818] text-sm transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
          >
            ▼
          </span>
        </div>
      </button>

      {expanded && (
        <div id={`archive-week-${weekNumber}-body`} className="px-6 pb-6 pt-1">
          <div className="flex flex-wrap justify-center gap-3 mb-6">
            <HomeMutationCard mutation={mutA} />
            <HomeMutationCard mutation={mutB} />
          </div>

          <ChallengeGenerator seed={seed} weekNumber={weekNumber} weekOverride={weekNumber} />
        </div>
      )}
    </div>
  );
}
