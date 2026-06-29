'use client';

import { useState } from 'react';
import { getActiveMutations, getWeekName } from '@/lib/mutations/registry';
import { getWeekStart, getWeekEnd, getWeekSeed, formatWeekDate } from '@/lib/challenge/week';
import { HomeMutationCard } from '@/app/components/HomeMutationCard';
import { ChallengeGenerator } from '@/app/challenge/ChallengeGenerator';
import { Leaderboard } from '@/app/components/Leaderboard';
import { formatHMS } from '@/lib/time-format';
import type { PublicSubmission } from '@/lib/leaderboard';

type Props = {
  weekNumber: number;
  entries?: PublicSubmission[];
  hellEntries?: PublicSubmission[];
};

export function ArchiveWeekCard({ weekNumber, entries = [], hellEntries = [] }: Props) {
  const weekName = getWeekName(weekNumber);
  const mutations = getActiveMutations(weekNumber);
  const seed = getWeekSeed(weekNumber);
  const start = getWeekStart(weekNumber);
  const end = getWeekEnd(weekNumber);
  const [expanded, setExpanded] = useState(false);
  const champion = entries[0];
  const hellChampion = hellEntries[0];

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
        {champion && (
          <p className="font-cinzel text-[11px] tracking-[0.18em] uppercase text-[#c8942a] mt-3">
            Champion: <span className="text-[#e6c068]">{champion.name}</span>
            {champion.className && (
              <span className="text-[#a87830]"> · {champion.className}</span>
            )}
            <span className="text-[#7a5818] normal-case tracking-normal"> · </span>
            <span className="font-mono normal-case tracking-normal">{formatHMS(champion.timeSeconds)}</span>
          </p>
        )}
        {hellChampion && (
          <p className="font-cinzel text-[11px] tracking-[0.18em] uppercase text-[#e8602e] mt-1.5">
            Hell Champion: <span className="text-[#f08850]">{hellChampion.name}</span>
            {hellChampion.className && (
              <span className="text-[#b86030]"> · {hellChampion.className}</span>
            )}
            <span className="text-[#9a4a2a] normal-case tracking-normal"> · </span>
            <span className="font-mono normal-case tracking-normal">{formatHMS(hellChampion.timeSeconds)}</span>
          </p>
        )}
      </button>

      {expanded && (
        <div id={`archive-week-${weekNumber}-body`} className="px-6 pb-6 pt-1">
          <div className="flex flex-wrap justify-center gap-3 mb-6">
            {mutations.map((m) => (
              <HomeMutationCard key={m.id} mutation={m} />
            ))}
          </div>

          {entries.length > 0 && (
            <div className="mb-6">
              <p className="font-cinzel text-[10px] tracking-[0.32em] uppercase text-[#9a7a2a] mb-3">
                Leaderboard
              </p>
              <Leaderboard weekNumber={weekNumber} entries={entries} />
            </div>
          )}

          {hellEntries.length > 0 && (
            <div className="mb-6">
              <p className="font-cinzel text-[10px] tracking-[0.32em] uppercase text-[#e8602e] mb-3">
                Hell Leaderboard
              </p>
              <Leaderboard weekNumber={weekNumber} difficulty="hell" entries={hellEntries} limit={1} />
            </div>
          )}

          <ChallengeGenerator seed={seed} weekNumber={weekNumber} weekOverride={weekNumber} />
        </div>
      )}
    </div>
  );
}
