'use client';

interface Skill {
  name: string;
  originalClass: string;
  row: number;
  col: number;
}

interface Tab {
  sourceClass: string;
  sourceTree: number;
  skills: Skill[];
}

interface ClassTreeCardProps {
  code: string;
  name: string;
  tabs: Tab[];
}

const CLASS_COLORS: Record<string, string> = {
  ama: 'bg-green-900/50',
  sor: 'bg-blue-900/50',
  nec: 'bg-purple-900/50',
  pal: 'bg-yellow-900/50',
  bar: 'bg-red-900/50',
  dru: 'bg-emerald-900/50',
  ass: 'bg-pink-900/50',
  war: 'bg-orange-900/50',
};

const CLASS_BADGE_COLORS: Record<string, string> = {
  ama: 'bg-green-700 text-green-100',
  sor: 'bg-blue-700 text-blue-100',
  nec: 'bg-purple-700 text-purple-100',
  pal: 'bg-yellow-700 text-yellow-100',
  bar: 'bg-red-700 text-red-100',
  dru: 'bg-emerald-700 text-emerald-100',
  ass: 'bg-pink-700 text-pink-100',
  war: 'bg-orange-700 text-orange-100',
};

export default function ClassTreeCard({ code, name, tabs }: ClassTreeCardProps) {
  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900 overflow-hidden">
      <div className={`px-4 py-2 ${CLASS_COLORS[code] || 'bg-gray-800'}`}>
        <h3 className="text-lg font-bold text-white">{name}</h3>
      </div>
      <div className="p-3 space-y-3">
        {tabs.map((tab, tabIdx) => (
          <div key={tabIdx} className="space-y-1">
            <div className="text-xs text-gray-400">
              Tab {tabIdx + 1}: {tab.sourceClass} Tree {tab.sourceTree}
            </div>
            <div className="grid grid-cols-3 gap-1">
              {Array.from({ length: 18 }, (_, i) => {
                const row = Math.floor(i / 3) + 1;
                const col = (i % 3) + 1;
                const skill = tab.skills.find(s => s.row === row && s.col === col);

                if (!skill) {
                  return (
                    <div key={i} className="h-8 rounded bg-gray-800/30" />
                  );
                }

                return (
                  <div
                    key={i}
                    className="h-8 rounded bg-gray-800 flex items-center px-1 gap-1 border border-gray-700"
                    title={`${skill.name} (from ${skill.originalClass})`}
                  >
                    <span className={`text-[9px] px-1 rounded ${CLASS_BADGE_COLORS[skill.originalClass] || 'bg-gray-600 text-gray-200'}`}>
                      {skill.originalClass}
                    </span>
                    <span className="text-[10px] text-gray-300 truncate">
                      {skill.name}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
