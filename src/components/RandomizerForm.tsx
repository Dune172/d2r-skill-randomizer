'use client';

import { useState } from 'react';

interface RandomizerFormProps {
  onGenerate: (seed: string, options: { enablePrereqs: boolean; logic: 'minimal' | 'normal' }) => void;
  isLoading: boolean;
  initialSeed?: string;
}

export default function RandomizerForm({ onGenerate, isLoading, initialSeed }: RandomizerFormProps) {
  const [seed, setSeed] = useState(initialSeed ?? '');
  const [enablePrereqs, setEnablePrereqs] = useState(true);
  const [logic, setLogic] = useState<'minimal' | 'normal'>('normal');

  const randomSeed = () => setSeed(Math.floor(Math.random() * 2147483647).toString());

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (seed.trim()) onGenerate(seed.trim(), { enablePrereqs, logic });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Seed row */}
      <div>
        <label htmlFor="seed" className="block font-cinzel text-[11px] tracking-[0.25em] uppercase text-[#c8a870] mb-2">
          Seed
        </label>
        <div className="flex gap-2">
          <input
            id="seed"
            type="text"
            value={seed}
            onChange={e => setSeed(e.target.value)}
            placeholder="Enter a seed or any text…"
            className="flex-1 rounded bg-[#090203] border border-[#3a1510] px-4 py-2.5 text-[#e8d5a0] placeholder-[#4a3020]
              focus:outline-none focus:border-[#7a3020] focus:ring-1 focus:ring-[#7a3020]/40
              transition-colors text-sm"
          />
          <button
            type="button"
            onClick={randomSeed}
            className="rounded border border-[#3a1510] bg-[#0e0506] px-4 py-2.5 text-xs text-[#c8a870]
              hover:text-[#e8d5a0] hover:border-[#5c2218] hover:bg-[#150708]
              transition-all duration-200 font-cinzel tracking-widest uppercase"
          >
            Random
          </button>
        </div>
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

      {/* Submit */}
      <div className="pt-1">
        <button
          type="submit"
          disabled={isLoading || !seed.trim()}
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
