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

const CLASS_THEME: Record<string, { headerBg: string; headerText: string; accent: string; badge: string }> = {
  ama: { headerBg: 'bg-[#071a09]', headerText: 'text-[#58c070]', accent: 'border-[#1e4a22]', badge: 'bg-[#0e2e12] text-[#72e08a]' },
  sor: { headerBg: 'bg-[#060a1e]', headerText: 'text-[#5898e0]', accent: 'border-[#162050]', badge: 'bg-[#0a1430] text-[#78b8ff]' },
  nec: { headerBg: 'bg-[#050e08]', headerText: 'text-[#50b050]', accent: 'border-[#183020]', badge: 'bg-[#0a2010] text-[#68d870]' },
  pal: { headerBg: 'bg-[#1a1406]', headerText: 'text-[#e8c050]', accent: 'border-[#4a3810]', badge: 'bg-[#2e2208] text-[#f0d868]' },
  bar: { headerBg: 'bg-[#1c0606]', headerText: 'text-[#e05858]', accent: 'border-[#501616]', badge: 'bg-[#300a0a] text-[#f08080]' },
  dru: { headerBg: 'bg-[#150e04]', headerText: 'text-[#c8a040]', accent: 'border-[#402e10]', badge: 'bg-[#281c08] text-[#e0c060]' },
  ass: { headerBg: 'bg-[#0e0614]', headerText: 'text-[#b868e0]', accent: 'border-[#341060]', badge: 'bg-[#1c0a30] text-[#d890f0]' },
  war: { headerBg: 'bg-[#1a0c04]', headerText: 'text-[#e88038]', accent: 'border-[#502010]', badge: 'bg-[#2e1208] text-[#f0a858]' },
};

const DEFAULT_THEME = {
  headerBg: 'bg-[#0e0808]', headerText: 'text-[#888]', accent: 'border-[#2a1a1a]', badge: 'bg-[#1a1010] text-[#aaa]',
};

export default function ClassTreeCard({ code, name, tabs }: ClassTreeCardProps) {
  const theme = CLASS_THEME[code] || DEFAULT_THEME;

  return (
    <div className={`rounded-lg border ${theme.accent} overflow-hidden shadow-lg`}>
      {/* Class header */}
      <div className={`px-4 py-3 ${theme.headerBg} border-b ${theme.accent}`}>
        <h3 className={`font-cinzel font-bold text-sm tracking-[0.18em] uppercase ${theme.headerText}`}>
          {name}
        </h3>
      </div>

      {/* Grey stone background — mimics the in-game skill tree panel */}
      <div className="p-3 space-y-4 bg-[#222222]">
        {tabs.map((tab, tabIdx) => (
          <div key={tabIdx}>
            <div className="text-[9px] tracking-[0.15em] text-[#9a9090] uppercase mb-1.5 font-cinzel">
              Tab {tabIdx + 1} · {tab.sourceClass} / Tree {tab.sourceTree}
            </div>
            <div className="grid grid-cols-3 gap-[3px]">
              {Array.from({ length: 18 }, (_, i) => {
                const row = Math.floor(i / 3) + 1;
                const col = (i % 3) + 1;
                const skill = tab.skills.find(s => s.row === row && s.col === col);

                if (!skill) {
                  return (
                    <div key={i} className="h-8 rounded-sm bg-[#181818] border border-[#2e2e2e]" />
                  );
                }

                const skillTheme = CLASS_THEME[skill.originalClass] || DEFAULT_THEME;

                return (
                  <div
                    key={i}
                    className="h-8 rounded-sm bg-[#2e2e2e] border border-[#404040] flex items-center px-1.5 gap-1 hover:border-[#606060] transition-colors"
                    title={`${skill.name} (from ${skill.originalClass})`}
                  >
                    <span className={`text-[8px] px-1 py-px rounded-sm flex-shrink-0 font-mono font-bold leading-none ${skillTheme.badge}`}>
                      {skill.originalClass}
                    </span>
                    <span className="text-[10px] text-[#d8ccc0] truncate leading-none">
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
