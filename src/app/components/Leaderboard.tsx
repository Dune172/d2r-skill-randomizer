'use client';

import { useEffect, useState } from 'react';
import { formatHMS } from '@/lib/time-format';
import type { Difficulty, PublicSubmission } from '@/lib/leaderboard';

type Props = {
  weekNumber: number;
  /** Which board to read. Defaults to 'normal'. */
  difficulty?: Difficulty;
  /** When provided, render these directly and skip the fetch (used by archive cards). */
  entries?: PublicSubmission[];
  /** Bump to force a refetch (used after a successful submission). */
  refreshKey?: number;
  /** Limit the number of rows rendered. Defaults to 3. */
  limit?: number;
  /** When true, show a "Show all" toggle if there are more than `limit` entries. */
  expandable?: boolean;
};

const RANK_COLORS = ['#e6c068', '#c8b890', '#b08a4a'];

function CrownIcon() {
  // Three-bump heraldic crown, sized to sit clearly above the rank "1" digit.
  return (
    <svg
      viewBox="0 0 24 14"
      width="18"
      height="11"
      fill="currentColor"
      aria-hidden="true"
      className="mx-auto mb-0.5 drop-shadow-[0_0_6px_rgba(230,192,104,0.7)]"
    >
      <path d="M2 3 L6 9 L12 1 L18 9 L22 3 L20 13 L4 13 Z" />
      <circle cx="2" cy="3" r="1.4" />
      <circle cx="12" cy="1" r="1.4" />
      <circle cx="22" cy="3" r="1.4" />
    </svg>
  );
}

export function Leaderboard({ weekNumber, difficulty = 'normal', entries: prop, refreshKey = 0, limit = 3, expandable = false }: Props) {
  const [entries, setEntries] = useState<PublicSubmission[] | null>(prop ?? null);
  const [loading, setLoading] = useState(prop === undefined);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const propsControlled = prop !== undefined;

  useEffect(() => {
    if (propsControlled) {
      setEntries(prop ?? []);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/leaderboard?week=${weekNumber}&difficulty=${difficulty}`, { cache: 'no-store' })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setEntries(Array.isArray(data?.entries) ? data.entries : []);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Failed to load leaderboard.');
        setEntries([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [weekNumber, difficulty, refreshKey, propsControlled, prop]);

  if (loading) {
    return (
      <p className="text-center text-xs text-[#7a5818] tracking-widest font-mono">
        Loading runs…
      </p>
    );
  }

  if (error) {
    return (
      <p className="text-center text-xs text-[#a8503a] tracking-widest font-mono">
        Could not load leaderboard.
      </p>
    );
  }

  const totalEntries = entries?.length ?? 0;
  const showExpandToggle = expandable && totalEntries > limit;
  const visibleEntries = showExpandToggle && expanded ? entries! : (entries?.slice(0, limit) ?? []);
  // When collapsed (or no expand at all), pad with empty slots up to `limit`. When expanded, show all entries with no padding.
  const slotCount = expanded ? visibleEntries.length : Math.max(limit, visibleEntries.length);
  const slots: (PublicSubmission | null)[] = Array.from({ length: slotCount }, (_, i) => visibleEntries[i] ?? null);

  return (
    <div className="max-w-md mx-auto">
      <ol className="space-y-2 text-left">
        {slots.map((entry, i) => (
          <li
            key={entry?.id ?? `empty-${i}`}
            className={`flex items-center gap-3 border px-3 py-2 ${
              entry
                ? 'border-[#3a1510]/60 bg-[#0a0203]/60'
                : 'border-[#3a1510]/30 bg-[#0a0203]/30'
            }`}
          >
            <span
              className="font-cinzel font-black text-lg w-8 text-center flex flex-col items-center justify-center leading-none flex-shrink-0"
              style={{ color: entry ? (RANK_COLORS[i] ?? '#7a5818') : '#5a3818' }}
            >
              {i === 0 && <CrownIcon />}
              <span className="leading-none">{i + 1}</span>
            </span>
            {entry ? (
              <>
                <span className="flex-1 min-w-0 flex flex-col leading-tight">
                  <span className="truncate text-[#c8a870] text-sm font-cinzel tracking-wide">
                    {entry.name}
                  </span>
                  {entry.className && (
                    <span className="truncate text-[10px] text-[#7a5818] uppercase tracking-[0.18em]">
                      {entry.className}
                    </span>
                  )}
                </span>
                <span className="font-mono text-[#c8942a] text-sm tabular-nums">
                  {formatHMS(entry.timeSeconds)}
                </span>
                <a
                  href={entry.proofUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Watch ${entry.name}'s run`}
                  className="text-[#7a5818] hover:text-[#c8942a] transition-colors text-sm"
                  title="Watch run"
                >
                  ↗
                </a>
              </>
            ) : (
              <>
                <span className="flex-1 text-[#5a3818] text-sm font-cinzel tracking-wide italic select-none">
                  —
                </span>
                <span className="font-mono text-[#5a3818] text-sm tabular-nums select-none">
                  —
                </span>
                <span className="text-transparent text-sm select-none" aria-hidden="true">↗</span>
              </>
            )}
          </li>
        ))}
      </ol>

      {showExpandToggle && (
        <div className="text-center mt-3">
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="font-cinzel tracking-[0.2em] uppercase text-[10px] text-[#9a5a3a] hover:text-[#d8784a] transition-colors"
          >
            {expanded ? 'Show top 3' : `Show all ${totalEntries} runs`}
          </button>
        </div>
      )}
    </div>
  );
}
