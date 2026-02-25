'use client';

import { useState } from 'react';

interface RandomizerFormProps {
  onGenerate: (seed: string, options: { enablePrereqs: boolean; logic: 'minimal' | 'normal'; playersEnabled: boolean; playersCount: number; playersActs: number[]; startingItems: { teleportStaff: boolean; teleportStaffLevel: number } }) => void;
  isLoading: boolean;
  seed: string;
  onSeedChange: (s: string) => void;
}

export default function RandomizerForm({ onGenerate, isLoading, seed, onSeedChange }: RandomizerFormProps) {
  const [enablePrereqs, setEnablePrereqs] = useState(true);
  const [logic, setLogic] = useState<'minimal' | 'normal'>('normal');
  const [playersCount, setPlayersCount] = useState(1);
  const [playersActs, setPlayersActs] = useState<number[]>([1, 2, 3, 4, 5]);
  const [teleportStaff, setTeleportStaff] = useState(false);
  const [teleportStaffLevel, setTeleportStaffLevel] = useState(1);

  const toggleAct = (act: number) =>
    setPlayersActs(prev => prev.includes(act) ? prev.filter(a => a !== act) : [...prev, act]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const effectiveSeed = seed.trim() || Math.floor(Math.random() * 2147483647).toString();
    if (!seed.trim()) onSeedChange(effectiveSeed);
    onGenerate(effectiveSeed, { enablePrereqs, logic, playersEnabled: playersCount > 1, playersCount, playersActs, startingItems: { teleportStaff, teleportStaffLevel } });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Seed row */}
      <div>
        <label htmlFor="seed" className="block font-cinzel text-[11px] tracking-[0.25em] uppercase text-[#c8a870] mb-2">
          Seed
        </label>
        <input
          id="seed"
          type="text"
          value={seed}
          onChange={e => onSeedChange(e.target.value)}
          placeholder="Leave blank for random…"
          className="w-full rounded bg-[#090203] border border-[#3a1510] px-4 py-2.5 text-[#e8d5a0] placeholder-[#4a3020]
            focus:outline-none focus:border-[#7a3020] focus:ring-1 focus:ring-[#7a3020]/40
            transition-colors text-sm"
        />
      </div>

      {/* Options row */}
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3 pt-1">
        {/* Prerequisites checkbox */}
        <label className="flex items-center gap-2.5 cursor-pointer group select-none" htmlFor="enablePrereqs">
          <div className="relative flex-shrink-0">
            <input
              id="enablePrereqs"
              type="checkbox"
              checked={enablePrereqs}
              onChange={e => setEnablePrereqs(e.target.checked)}
              className="sr-only"
            />
            <div className={`w-5 h-5 rounded border transition-all duration-200 flex items-center justify-center
              ${enablePrereqs
                ? 'bg-[#7a1010] border-[#c42020]'
                : 'bg-[#090203] border-[#3a1510] group-hover:border-[#5c2218]'}`}
            >
              {enablePrereqs && (
                <svg className="w-3 h-3 text-[#f0c040]" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
          </div>
          <span className="text-sm text-[#c8a870] group-hover:text-[#f0d090] transition-colors">
            Skill prerequisites
          </span>
        </label>

        {/* Logic level dropdown */}
        <div className="flex items-center gap-3 ml-auto">
          <label htmlFor="logic" className="font-cinzel text-[11px] tracking-[0.25em] uppercase text-[#c8a870] whitespace-nowrap">
            Logic
          </label>
          <div className="relative">
            <select
              id="logic"
              value={logic}
              onChange={e => setLogic(e.target.value as 'minimal' | 'normal')}
              className="appearance-none rounded border border-[#3a1510] bg-[#090203] pl-4 pr-8 py-2
                text-sm text-[#e8d5a0]
                focus:outline-none focus:border-[#7a3020] focus:ring-1 focus:ring-[#7a3020]/40
                transition-colors cursor-pointer"
            >
              <option value="minimal">Minimal</option>
              <option value="normal">Normal</option>
            </select>
            <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[#7a5818] text-[10px]">
              ▾
            </div>
          </div>
        </div>
      </div>

      {/* Players row */}
      <div className="pt-1">
        <div className="flex items-center gap-3">
          <label htmlFor="playersCount" className="font-cinzel text-[11px] tracking-[0.25em] uppercase text-[#c8a870] whitespace-nowrap">
            Players
          </label>
          <input
            id="playersCount"
            type="number"
            min={1}
            max={8}
            value={playersCount}
            onChange={e => setPlayersCount(Math.min(8, Math.max(1, Number(e.target.value) || 1)))}
            className="w-16 rounded border border-[#3a1510] bg-[#090203] px-3 py-2
              text-sm text-[#e8d5a0] text-center
              focus:outline-none focus:border-[#7a3020] focus:ring-1 focus:ring-[#7a3020]/40
              transition-colors"
          />
        </div>
        {playersCount > 1 && (
          <div className="flex flex-wrap gap-x-4 gap-y-2 mt-2">
            {([1, 2, 3, 4, 5] as const).map(act => {
              const labels = ['Act I', 'Act II', 'Act III', 'Act IV', 'Act V'];
              const checked = playersActs.includes(act);
              return (
                <label key={act} className="flex items-center gap-2 cursor-pointer group select-none">
                  <div className="relative flex-shrink-0">
                    <input type="checkbox" checked={checked}
                      onChange={() => toggleAct(act)} className="sr-only" />
                    <div className={`w-5 h-5 rounded border transition-all duration-200 flex items-center justify-center
                      ${checked ? 'bg-[#7a1010] border-[#c42020]'
                                : 'bg-[#090203] border-[#3a1510] group-hover:border-[#5c2218]'}`}>
                      {checked && (
                        <svg className="w-3 h-3 text-[#f0c040]" viewBox="0 0 12 12" fill="none">
                          <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2"
                            strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                  </div>
                  <span className="text-sm text-[#c8a870] group-hover:text-[#f0d090] transition-colors">
                    {labels[act - 1]}
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </div>

      {/* Starting Items section */}
      <div className="space-y-3 pt-1">
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-[#3a1510]/50" />
          <span className="font-cinzel text-[10px] tracking-[0.28em] uppercase text-[#5a3a18]">
            Starting Items
          </span>
          <div className="h-px flex-1 bg-[#3a1510]/50" />
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <label className="flex items-center gap-2.5 cursor-pointer group select-none" htmlFor="teleportStaff">
            <div className="relative flex-shrink-0">
              <input
                id="teleportStaff"
                type="checkbox"
                checked={teleportStaff}
                onChange={e => setTeleportStaff(e.target.checked)}
                className="sr-only"
              />
              <div className={`w-5 h-5 rounded border transition-all duration-200 flex items-center justify-center
                ${teleportStaff
                  ? 'bg-[#7a1010] border-[#c42020]'
                  : 'bg-[#090203] border-[#3a1510] group-hover:border-[#5c2218]'}`}
              >
                {teleportStaff && (
                  <svg className="w-3 h-3 text-[#f0c040]" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
            </div>
            <span className="text-sm text-[#c8a870] group-hover:text-[#f0d090] transition-colors">
              Start with Teleport Staff
            </span>
          </label>

          {teleportStaff && (
            <div className="flex items-center gap-3 ml-auto">
              <label htmlFor="teleportStaffLevel" className="font-cinzel text-[11px] tracking-[0.25em] uppercase text-[#c8a870] whitespace-nowrap">
                Req. Level
              </label>
              <div className="relative">
                <select
                  id="teleportStaffLevel"
                  value={teleportStaffLevel}
                  onChange={e => setTeleportStaffLevel(Number(e.target.value))}
                  className="appearance-none rounded border border-[#3a1510] bg-[#090203] pl-4 pr-8 py-2
                    text-sm text-[#e8d5a0]
                    focus:outline-none focus:border-[#7a3020] focus:ring-1 focus:ring-[#7a3020]/40
                    transition-colors cursor-pointer"
                >
                  <option value={1}>1</option>
                  <option value={6}>6</option>
                  <option value={12}>12</option>
                  <option value={18}>18</option>
                  <option value={24}>24</option>
                </select>
                <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[#7a5818] text-[10px]">
                  ▾
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Submit */}
      <div className="pt-1">
        <button
          type="submit"
          disabled={isLoading}
          className="w-full rounded py-3
            font-cinzel font-bold tracking-[0.22em] text-sm uppercase text-[#e8d5a0]
            bg-gradient-to-b from-[#5c1010] to-[#380808]
            border border-[#8b2820]
            hover:from-[#7a1818] hover:to-[#480e0e] hover:border-[#c42020]
            disabled:opacity-40 disabled:cursor-not-allowed
            transition-all duration-200
            shadow-[0_0_14px_rgba(139,40,32,0.22)] hover:shadow-[0_0_26px_rgba(196,32,32,0.38)]"
        >
          {isLoading ? 'Generating…' : 'Generate Mod'}
        </button>
      </div>
    </form>
  );
}
