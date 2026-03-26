'use client';

import { useState, useCallback } from 'react';
import ClassTreeCard from './ClassTreeCard';

interface PreviewData {
  seed: number;
  classes: {
    code: string;
    name: string;
    tabs: {
      sourceClass: string;
      sourceTree: number;
      skills: {
        name: string;
        originalClass: string;
        row: number;
        col: number;
      }[];
    }[];
  }[];
}

interface SkillTreePreviewProps {
  data: PreviewData;
}

export default function SkillTreePreview({ data }: SkillTreePreviewProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopySeed = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(data.seed.toString()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [data.seed]);

  return (
    <div>
      <div className="w-full flex items-center gap-4 mb-6">
        <div className="h-px flex-1 bg-[#3a1510]" />
        <button
          onClick={() => setExpanded(e => !e)}
          className="font-cinzel font-bold text-xs tracking-[0.25em] uppercase text-[#c8942a] hover:text-[#e8b040] transition-colors flex items-center gap-2 group"
        >
          Preview — Seed {data.seed}
          <span className={`text-[10px] transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}>▾</span>
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
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {data.classes.map(cls => (
            <ClassTreeCard key={cls.code} code={cls.code} name={cls.name} tabs={cls.tabs} />
          ))}
        </div>
      )}
    </div>
  );
}
