'use client';

import { useState } from 'react';

type Preset = 'custom' | 'season1race';

interface FormState {
  enablePrereqs: boolean;
  playersCount: number;
  playersActs: number[];
  teleportStaff: boolean;
  teleportStaffLevel: number;
  hirelingAura: boolean;
  hirelingSkills: boolean;
}

const SEASON1_PRESET: FormState = {
  enablePrereqs: true,
  playersCount: 4,
  playersActs: [1],
  teleportStaff: true,
  teleportStaffLevel: 6,
  hirelingAura: true,
  hirelingSkills: true,
};

const DEFAULT_STATE: FormState = {
  enablePrereqs: true,
  playersCount: 1,
  playersActs: [1, 2, 3, 4, 5],
  teleportStaff: false,
  teleportStaffLevel: 1,
  hirelingAura: true,
  hirelingSkills: true,
};

interface RandomizerFormProps {
  onGenerate: (seed: string, options: { enablePrereqs: boolean; playersEnabled: boolean; playersCount: number; playersActs: number[]; startingItems: { teleportStaff: boolean; teleportStaffLevel: number }; hirelingAura: boolean; hirelingSkills: boolean }) => void;
  isLoading: boolean;
  seed: string;
  onSeedChange: (s: string) => void;
}

function Checkbox({ id, checked, onChange, label }: { id: string; checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer group select-none" htmlFor={id}>
      <div className="relative flex-shrink-0">
        <input id={id} type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="sr-only" />
        <div className={`w-5 h-5 rounded border transition-all duration-200 flex items-center justify-center
          ${checked ? 'bg-[#7a1010] border-[#c42020]' : 'bg-[#090203] border-[#3a1510] group-hover:border-[#5c2218]'}`}>
          {checked && (
            <svg className="w-3 h-3 text-[#f0c040]" viewBox="0 0 12 12" fill="none">
              <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>
      </div>
      <span className="text-sm text-[#c8a870] group-hover:text-[#f0d090] transition-colors">{label}</span>
    </label>
  );
}

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-px flex-1 bg-[#3a1510]/50" />
      <span className="font-cinzel text-[10px] tracking-[0.28em] uppercase text-[#c8a870]">{label}</span>
      <div className="h-px flex-1 bg-[#3a1510]/50" />
    </div>
  );
}

export default function RandomizerForm({ onGenerate, isLoading, seed, onSeedChange }: RandomizerFormProps) {
  const [preset, setPreset] = useState<Preset>('season1race');
  const [enablePrereqs, setEnablePrereqs] = useState(SEASON1_PRESET.enablePrereqs);
  const [playersCount, setPlayersCount] = useState(SEASON1_PRESET.playersCount);
  const [playersActs, setPlayersActs] = useState<number[]>(SEASON1_PRESET.playersActs);
  const [teleportStaff, setTeleportStaff] = useState(SEASON1_PRESET.teleportStaff);
  const [teleportStaffLevel, setTeleportStaffLevel] = useState(SEASON1_PRESET.teleportStaffLevel);
  const [hirelingAura, setHirelingAura] = useState(SEASON1_PRESET.hirelingAura);
  const [hirelingSkills, setHirelingSkills] = useState(SEASON1_PRESET.hirelingSkills);

  const applyPreset = (p: Preset) => {
    setPreset(p);
    if (p === 'season1race') {
      setEnablePrereqs(SEASON1_PRESET.enablePrereqs);
      setPlayersCount(SEASON1_PRESET.playersCount);
      setPlayersActs(SEASON1_PRESET.playersActs);
      setTeleportStaff(SEASON1_PRESET.teleportStaff);
      setTeleportStaffLevel(SEASON1_PRESET.teleportStaffLevel);
      setHirelingAura(SEASON1_PRESET.hirelingAura);
      setHirelingSkills(SEASON1_PRESET.hirelingSkills);
    }
  };

  // Wrap any manual field change to revert preset indicator to "Custom"
  function field<T>(setter: (v: T) => void) {
    return (v: T) => { setPreset('custom'); setter(v); };
  }

  const toggleAct = (act: number) => {
    setPreset('custom');
    setPlayersActs(prev => prev.includes(act) ? prev.filter(a => a !== act) : [...prev, act]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const effectiveSeed = seed.trim() || Math.floor(Math.random() * 2147483647).toString();
    if (!seed.trim()) onSeedChange(effectiveSeed);
    onGenerate(effectiveSeed, {
      enablePrereqs,
      playersEnabled: playersCount > 1,
      playersCount,
      playersActs,
      startingItems: { teleportStaff, teleportStaffLevel },
      hirelingAura,
      hirelingSkills,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">

      {/* Preset */}
      <div className="flex items-center justify-end gap-2">
        <label htmlFor="preset" className="font-cinzel text-[11px] tracking-[0.25em] uppercase text-[#c8a870]">
          Preset
        </label>
        <div className="relative">
          <select
            id="preset"
            value={preset}
            onChange={e => applyPreset(e.target.value as Preset)}
            className="appearance-none rounded border border-[#3a1510] bg-[#090203] pl-3 pr-7 py-1.5
              text-xs text-[#e8d5a0]
              focus:outline-none focus:border-[#7a3020] focus:ring-1 focus:ring-[#7a3020]/40
              transition-colors cursor-pointer"
          >
            <option value="custom">Custom</option>
            <option value="season1race">Season 1 Race</option>
          </select>
          <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[#7a5818] text-[10px]">▾</div>
        </div>
      </div>

      {/* Gameplay section */}
      <div className="space-y-3 pt-1">
        <SectionDivider label="Gameplay" />

        <Checkbox
          id="enablePrereqs"
          checked={enablePrereqs}
          onChange={field(setEnablePrereqs)}
          label="Skill prerequisites"
        />

        <div>
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
              onChange={e => { setPreset('custom'); setPlayersCount(Math.min(8, Math.max(1, Number(e.target.value) || 1))); }}
              className="w-16 rounded border border-[#3a1510] bg-[#090203] px-3 py-2
                text-sm text-[#e8d5a0] text-center
                focus:outline-none focus:border-[#7a3020] focus:ring-1 focus:ring-[#7a3020]/40
                transition-colors"
            />
          </div>
          {playersCount > 1 && (
            <div className="flex flex-wrap gap-x-4 gap-y-2 mt-2">
              {([1, 2, 3, 4, 5] as const).map(act => {
                const actLabels = ['Act I', 'Act II', 'Act III', 'Act IV', 'Act V'];
                const checked = playersActs.includes(act);
                return (
                  <label key={act} className="flex items-center gap-2 cursor-pointer group select-none">
                    <div className="relative flex-shrink-0">
                      <input type="checkbox" checked={checked} onChange={() => toggleAct(act)} className="sr-only" />
                      <div className={`w-5 h-5 rounded border transition-all duration-200 flex items-center justify-center
                        ${checked ? 'bg-[#7a1010] border-[#c42020]' : 'bg-[#090203] border-[#3a1510] group-hover:border-[#5c2218]'}`}>
                        {checked && (
                          <svg className="w-3 h-3 text-[#f0c040]" viewBox="0 0 12 12" fill="none">
                            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                    </div>
                    <span className="text-sm text-[#c8a870] group-hover:text-[#f0d090] transition-colors">{actLabels[act - 1]}</span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Items section */}
      <div className="space-y-3 pt-1">
        <SectionDivider label="Items" />

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Checkbox
            id="teleportStaff"
            checked={teleportStaff}
            onChange={field(setTeleportStaff)}
            label="Teleport Staff"
          />

          {teleportStaff && (
            <div className="flex items-center gap-3 ml-auto">
              <label htmlFor="teleportStaffDropSource" className="font-cinzel text-[11px] tracking-[0.25em] uppercase text-[#c8a870] whitespace-nowrap">
                Dropped By
              </label>
              <div className="relative">
                <select
                  id="teleportStaffDropSource"
                  value="Corpsefire"
                  disabled
                  className="appearance-none rounded border border-[#3a1510] bg-[#090203] pl-4 pr-8 py-2
                    text-sm text-[#e8d5a0]
                    focus:outline-none focus:border-[#7a3020] focus:ring-1 focus:ring-[#7a3020]/40
                    transition-colors cursor-pointer"
                >
                  <option value="Corpsefire">Corpsefire</option>
                </select>
                <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[#7a5818] text-[10px]">▾</div>
              </div>
              <label htmlFor="teleportStaffLevel" className="font-cinzel text-[11px] tracking-[0.25em] uppercase text-[#c8a870] whitespace-nowrap">
                Req. Level
              </label>
              <div className="relative">
                <select
                  id="teleportStaffLevel"
                  value={teleportStaffLevel}
                  onChange={e => { setPreset('custom'); setTeleportStaffLevel(Number(e.target.value)); }}
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
                <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[#7a5818] text-[10px]">▾</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Hirelings section */}
      <div className="space-y-3 pt-1">
        <SectionDivider label="Hirelings" />

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Checkbox
            id="hirelingAura"
            checked={hirelingAura}
            onChange={field(setHirelingAura)}
            label="All hirelings have an aura"
          />
          <Checkbox
            id="hirelingSkills"
            checked={hirelingSkills}
            onChange={field(setHirelingSkills)}
            label="Shuffle attack skills"
          />
        </div>
      </div>

      {/* Seed */}
      <div className="space-y-3 pt-1">
        <div className="h-px bg-[#3a1510]/50" />
        <div className="flex items-center gap-3">
          <label htmlFor="seed" className="font-cinzel text-[11px] tracking-[0.25em] uppercase text-[#c8a870] whitespace-nowrap flex-shrink-0">
            Seed
          </label>
          <input
            id="seed"
            type="text"
            value={seed}
            onChange={e => onSeedChange(e.target.value)}
            placeholder="Leave blank for random…"
            className="flex-1 rounded bg-[#090203] border border-[#3a1510] px-3 py-1.5 text-[#e8d5a0] placeholder-[#4a3020]
              focus:outline-none focus:border-[#7a3020] focus:ring-1 focus:ring-[#7a3020]/40
              transition-colors text-sm"
          />
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
