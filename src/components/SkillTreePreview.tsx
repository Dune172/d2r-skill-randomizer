'use client';

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
  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <div className="h-px flex-1 bg-[#3a1510]" />
        <h2 className="font-cinzel font-bold text-xs tracking-[0.25em] uppercase text-[#c8942a]">
          Preview — Seed {data.seed}
        </h2>
        <div className="h-px flex-1 bg-[#3a1510]" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {data.classes.map(cls => (
          <ClassTreeCard key={cls.code} code={cls.code} name={cls.name} tabs={cls.tabs} />
        ))}
      </div>
    </div>
  );
}
