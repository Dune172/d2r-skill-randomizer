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
      <h2 className="text-xl font-bold text-white mb-4">
        Preview (Seed: {data.seed})
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {data.classes.map(cls => (
          <ClassTreeCard
            key={cls.code}
            code={cls.code}
            name={cls.name}
            tabs={cls.tabs}
          />
        ))}
      </div>
    </div>
  );
}
