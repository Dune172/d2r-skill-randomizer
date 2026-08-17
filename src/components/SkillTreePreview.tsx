'use client';

import { useState, useCallback } from 'react';

import type { PreviewData } from '@/lib/randomizer/types';
import { CLASS_THEME, LEGEND_ORDER } from '@/lib/ui/class-theme';
import ClassTreeCard from './ClassTreeCard';

interface SkillTreePreviewProps {
  data: PreviewData;
}

/** Class cards per grid row at the widest breakpoint (lg:grid-cols-2). */
const CARDS_PER_ROW = 2;

export default function SkillTreePreview({ data }: SkillTreePreviewProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  // Class cards open by row rather than individually, so the two cards sharing a
  // row are always the same height. All rows start closed.
  const [openRows, setOpenRows] = useState<ReadonlySet<number>>(() => new Set());

  const toggleRow = useCallback((row: number) => {
    setOpenRows(prev => {
      const next = new Set(prev);
      if (!next.delete(row)) next.add(row);
      return next;
    });
  }, []);

  const handleCopySeed = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(data.seed.toString()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [data.seed]);

  return (
    <div>
      <div className="w-full flex flex-wrap items-center justify-center gap-x-4 gap-y-2 mb-6">
        <div className="h-px flex-1 bg-[#3a1510]" />
        <button
          onClick={() => setExpanded(e => !e)}
          className="font-cinzel font-bold text-xs tracking-[0.25em] uppercase text-[#c8942a] hover:text-[#e8b040] transition-colors flex items-center gap-2 group"
        >
          Spoiler - Seed {data.seed}
          <span className={`text-[20px] transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}>▾</span>
        </button>
        <button
          onClick={handleCopySeed}
          title="Copy seed"
          className="flex items-center gap-1 px-2 py-0.5 rounded border border-[#3a1510] bg-[#0c0405] hover:border-[#7a3020] transition-colors text-[10px] text-[#c8a870] hover:text-[#f0d090] font-cinzel tracking-[0.15em]"
        >
          {copied ? 'Copied!' : (
            <>
              <svg className="w-3 h-3" viewBox="0 0 14 14" fill="none">
                <rect x="4" y="4" width="8" height="9" rx="1" stroke="currentColor" strokeWidth="1.2"/>
                <path d="M2 10V2h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Copy
            </>
          )}
        </button>
        <div className="h-px flex-1 bg-[#3a1510]" />
      </div>

      {expanded && (
        <>
          {data.masked ? (
            <p className="mb-5 text-center text-[11px] leading-relaxed text-[#a89060]">
              Mystery Box is active — every skill is disguised in game, so the spoiler is
              hidden too. You will not know what you have picked until you cast it.
            </p>
          ) : (
            <div className="mb-5 space-y-2">
              <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
                <span className="font-cinzel text-[10px] tracking-[0.22em] uppercase text-[#7a5818]">
                  Frame colour · source class
                </span>
                {LEGEND_ORDER.map(code => (
                  <span key={code} className="flex items-center gap-1.5 text-[10px] tracking-[0.1em] text-[#a89060]">
                    <span
                      aria-hidden="true"
                      className="w-3 h-3 border-2 bg-[#141210]"
                      style={{ borderColor: CLASS_THEME[code].frame }}
                    />
                    {CLASS_THEME[code].label}
                  </span>
                ))}
              </div>
              <p className="text-center text-[10px] tracking-[0.1em] text-[#6e6048]">
                <span className="hidden md:inline">Open a class to see its trees, then hover an icon for its name and description</span>
                <span className="md:hidden">Open a class to see its trees, then tap an icon for details</span>
              </p>
            </div>
          )}

          {/* items-start so a collapsed card doesn't stretch to match an expanded
              neighbour in the same grid row. */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            {data.classes.map((cls, i) => {
              const row = Math.floor(i / CARDS_PER_ROW);
              return (
                <ClassTreeCard
                  key={cls.code}
                  code={cls.code}
                  name={cls.name}
                  tabs={cls.tabs}
                  masked={data.masked}
                  expanded={openRows.has(row)}
                  onToggleExpanded={() => toggleRow(row)}
                />
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
