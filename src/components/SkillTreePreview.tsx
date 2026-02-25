'use client';

import { useState } from 'react';
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

  return (
    <div>
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-4 mb-6 group"
      >
        <div className="h-px flex-1 bg-[#3a1510] group-hover:bg-[#6a2518] transition-colors" />
        <span className="font-cinzel font-bold text-xs tracking-[0.25em] uppercase text-[#c8942a] group-hover:text-[#e8b040] transition-colors flex items-center gap-2">
          Preview — Seed {data.seed}
          <span className={`text-[10px] transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}>▾</span>
        </span>
        <div className="h-px flex-1 bg-[#3a1510] group-hover:bg-[#6a2518] transition-colors" />
      </button>

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
