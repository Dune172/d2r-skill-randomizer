'use client';

import { useState } from 'react';

type Preset = 'custom' | 'season1race';

interface FormState {
  enablePrereqs: boolean;
  playersCount: number;
  playersActs: number[];
  teleportStaff: boolean;
  teleportStaffLevel: number;
  teleportStaffDropSource: string;
  horadricCube: boolean;
  hirelingAura: boolean;
  disableChat: boolean;
  xpMultiplier: number;
  xpActs: number[];
}

const SEASON1_PRESET: FormState = {
  enablePrereqs: true,
  playersCount: 2,
  playersActs: [4, 5],
  teleportStaff: true,
  teleportStaffLevel: 6,
  teleportStaffDropSource: 'Corpsefire',
  horadricCube: true,
  hirelingAura: true,
  disableChat: true,
  xpMultiplier: 3,
  xpActs: [1, 2, 3],
};

const DEFAULT_STATE: FormState = {
  enablePrereqs: true,
  playersCount: 1,
  playersActs: [1, 2, 3, 4, 5],
  teleportStaff: false,
  teleportStaffLevel: 1,
  teleportStaffDropSource: 'Corpsefire',
  horadricCube: false,
  hirelingAura: true,
  disableChat: false,
  xpMultiplier: 1,
  xpActs: [1, 2, 3, 4, 5],
};

interface RandomizerFormProps {
  initialOptions?: { enablePrereqs: boolean; playersEnabled: boolean; playersCount: number; playersActs: number[]; startingItems: { teleportStaff: boolean; teleportStaffLevel: number; teleportStaffDropSource: string; horadricCube: boolean }; hirelingAura: boolean; disableChat: boolean; xpMultiplier: number; xpActs: number[] };
  onGenerate: (seed: string, options: { enablePrereqs: boolean; playersEnabled: boolean; playersCount: number; playersActs: number[]; startingItems: { teleportStaff: boolean; teleportStaffLevel: number; teleportStaffDropSource: string; horadricCube: boolean }; hirelingAura: boolean; disableChat: boolean; xpMultiplier: number; xpActs: number[] }) => void;
  isLoading: boolean;
  seed: string;
  onSeedChange: (s: string) => void;
}

function Tip({ text }: { text: string }) {
  return (
    <span className="relative group/tip inline-flex items-center ml-1.5 cursor-default" onClick={e => e.preventDefault()}>
      <span className="text-[#5a3820] hover:text-[#c8a870] text-[11px] leading-none select-none transition-colors">ⓘ</span>
      <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-20 w-56 rounded border border-[#3a1510] bg-[#0d0305] px-2.5 py-1.5 text-xs text-[#c8a870] leading-relaxed shadow-lg opacity-0 group-hover/tip:opacity-100 transition-opacity duration-150 text-left whitespace-normal">
        {text}
      </span>
    </span>
  );
}

function Checkbox({ id, checked, onChange, label, tooltip }: { id: string; checked: boolean; onChange: (v: boolean) => void; label: string; tooltip?: string }) {
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
      <span className="text-sm text-[#c8a870] group-hover:text-[#f0d090] transition-colors flex items-center">
        {label}
        {tooltip && <Tip text={tooltip} />}
      </span>
    </label>
  );
}

function ActPillRow({
  acts,
  selected,
  onToggle,
}: {
  acts: readonly number[];
  selected: number[];
  onToggle: (act: number) => void;
}) {
  const actLabels = ['I', 'II', 'III', 'IV', 'V'];
  return (
    <div className="ml-1 pl-3 border-l-2 border-[#7a1010]/60 mt-2">
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-[#c8a870] font-cinzel tracking-wide mr-0.5">Acts</span>
        {acts.map(act => {
          const active = selected.includes(act);
          return (
            <button
              key={act}
              type="button"
              onClick={() => onToggle(act)}
              className={
                active
                  ? 'px-2.5 py-0.5 rounded text-xs font-cinzel tracking-wide border border-[#8b2820] bg-[#3a0808] text-[#f0c040] transition-all duration-150 select-none'
                  : 'px-2.5 py-0.5 rounded text-xs font-cinzel tracking-wide border border-[#3a1510] bg-[#090203] text-[#7a5030] transition-all duration-150 hover:border-[#5c2218] hover:text-[#c8a870] select-none'
              }
            >
              {actLabels[act - 1]}
            </button>
          );
        })}
      </div>
    </div>
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

export default function RandomizerForm({ initialOptions, onGenerate, isLoading, seed, onSeedChange }: RandomizerFormProps) {
  const [preset, setPreset] = useState<Preset>(initialOptions ? 'custom' : 'season1race');
  const [enablePrereqs, setEnablePrereqs] = useState(initialOptions?.enablePrereqs ?? SEASON1_PRESET.enablePrereqs);
  const [playersCount, setPlayersCount] = useState(initialOptions?.playersCount ?? SEASON1_PRESET.playersCount);
  const [playersActs, setPlayersActs] = useState<number[]>(initialOptions?.playersActs ?? SEASON1_PRESET.playersActs);
  const [teleportStaff, setTeleportStaff] = useState(initialOptions?.startingItems.teleportStaff ?? SEASON1_PRESET.teleportStaff);
  const [teleportStaffLevel, setTeleportStaffLevel] = useState(initialOptions?.startingItems.teleportStaffLevel ?? SEASON1_PRESET.teleportStaffLevel);
  const [teleportStaffDropSource, setTeleportStaffDropSource] = useState(initialOptions?.startingItems.teleportStaffDropSource ?? SEASON1_PRESET.teleportStaffDropSource);
  const [horadricCube, setHoradricCube] = useState(initialOptions?.startingItems.horadricCube ?? SEASON1_PRESET.horadricCube);
  const [hirelingAura, setHirelingAura] = useState(initialOptions?.hirelingAura ?? SEASON1_PRESET.hirelingAura);
  const [disableChat, setDisableChat] = useState(initialOptions?.disableChat ?? SEASON1_PRESET.disableChat);
  const [xpMultiplier, setXpMultiplier] = useState(initialOptions?.xpMultiplier ?? SEASON1_PRESET.xpMultiplier);
  const [xpActs, setXpActs] = useState<number[]>(initialOptions?.xpActs ?? SEASON1_PRESET.xpActs);
  const applyPreset = (p: Preset) => {
    setPreset(p);
    if (p === 'season1race') {
      setEnablePrereqs(SEASON1_PRESET.enablePrereqs);
      setPlayersCount(SEASON1_PRESET.playersCount);
      setPlayersActs(SEASON1_PRESET.playersActs);
      setTeleportStaff(SEASON1_PRESET.teleportStaff);
      setTeleportStaffLevel(SEASON1_PRESET.teleportStaffLevel);
      setTeleportStaffDropSource(SEASON1_PRESET.teleportStaffDropSource);
      setHoradricCube(SEASON1_PRESET.horadricCube);
      setHirelingAura(SEASON1_PRESET.hirelingAura);
      setDisableChat(SEASON1_PRESET.disableChat);
      setXpMultiplier(SEASON1_PRESET.xpMultiplier);
      setXpActs(SEASON1_PRESET.xpActs);
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

  const toggleXpAct = (act: number) => {
    setPreset('custom');
    setXpActs(prev => prev.includes(act) ? prev.filter(a => a !== act) : [...prev, act]);
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
      startingItems: { teleportStaff, teleportStaffLevel, teleportStaffDropSource, horadricCube },
      hirelingAura,
      disableChat,
      xpMultiplier,
      xpActs,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-1">

      {/* Preset */}
      <div className="flex items-center justify-end gap-2 pb-0">
        <label htmlFor="preset" className="font-cinzel text-[11px] tracking-[0.25em] uppercase text-[#c8a870]">
          Preset
        </label>
        <div className="relative group">
          <select
            id="preset"
            value={preset}
            onChange={e => applyPreset(e.target.value as Preset)}
            className="appearance-none rounded border border-[#3a1510] bg-[#090203] pl-3 pr-7 py-2
              text-sm text-[#e8d5a0]
              focus:outline-none focus:border-[#7a3020] focus:ring-1 focus:ring-[#7a3020]/40
              transition-colors cursor-pointer"
          >
            <option value="custom">Custom</option>
            <option value="season1race" title="Season Beta Race: Competitive preset for Normal difficulty Baal kill races. This is a beta, any and all feedback is appreciated!">Season Beta Race</option>
          </select>
          <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[#7a5818] text-[10px]">▾</div>
          {preset === 'season1race' && (
            <div className="pointer-events-none absolute right-0 top-full mt-1.5 z-10 w-72 rounded border border-[#3a1510] bg-[#0d0305] px-3 py-2 text-xs text-[#c8a870] leading-relaxed shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-150">
              Season Beta Race: Competitive preset for Normal difficulty Baal kill races. This is a beta, any and all feedback is appreciated!
            </div>
          )}
        </div>
      </div>

      {/* Gameplay section */}
      <div className="space-y-3 pt-1 pb-2">
        <SectionDivider label="Gameplay" />

        <div className="grid grid-cols-2 gap-4 items-start">
          {/* Left: Players */}
          <div>
            <Checkbox
              id="disableChat"
              checked={disableChat}
              onChange={field(setDisableChat)}
              label="Disable chat"
              tooltip="Removes the in-game chat box. Keeps the screen clean during races and prevents /players from being used."
            />
            <div className="flex items-center gap-3 mt-2.5">
              <label htmlFor="playersCount" className="text-sm text-[#c8a870] whitespace-nowrap flex items-center">
                /Players
                <Tip text="Simulates more players on the server, increasing monster HP and XP. Set to 1 for standard difficulty." />
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
              <ActPillRow acts={[1, 2, 3, 4, 5]} selected={playersActs} onToggle={toggleAct} />
            )}
          </div>

          {/* Right: Checkboxes */}
          <div className="flex flex-col justify-start gap-3">
            <Checkbox
              id="enablePrereqs"
              checked={!enablePrereqs}
              onChange={v => field(setEnablePrereqs)(!v)}
              label="No skill prerequisites"
              tooltip="Removes skill prerequisites, letting you invest points in any skill freely without unlocking earlier ones first."
            />
            <div>
              <div className="flex items-center gap-2.5">
                <label htmlFor="xpMultiplier" className="text-sm text-[#c8a870] whitespace-nowrap flex items-center">
                  XP Boost
                  <Tip text="Multiplies experience gained from monsters. Select which acts it applies to below." />
                </label>
                <div className="relative">
                  <select
                    id="xpMultiplier"
                    value={xpMultiplier}
                    onChange={e => { setPreset('custom'); setXpMultiplier(Number(e.target.value)); }}
                    className="appearance-none rounded border border-[#3a1510] bg-[#090203] pl-3 pr-7 py-2
                      text-sm text-[#e8d5a0]
                      focus:outline-none focus:border-[#7a3020] focus:ring-1 focus:ring-[#7a3020]/40
                      transition-colors cursor-pointer"
                  >
                    <option value={1}>1×</option>
                    <option value={1.5}>1.5×</option>
                    <option value={2}>2×</option>
                    <option value={2.5}>2.5×</option>
                    <option value={3}>3×</option>
                  </select>
                  <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[#7a5818] text-[10px]">▾</div>
                </div>
              </div>
              {xpMultiplier > 1 && (
                <ActPillRow acts={[1, 2, 3, 4, 5]} selected={xpActs} onToggle={toggleXpAct} />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Items section */}
      <div className="space-y-3 pt-1 pb-2">
        <SectionDivider label="Items" />

        <div className="grid grid-cols-2 gap-4">
          {/* Left: Teleport Staff */}
          <div>
            <Checkbox
              id="teleportStaff"
              checked={teleportStaff}
              onChange={field(setTeleportStaff)}
              label="Teleport Staff"
              tooltip="Starts you with a staff that has Teleport charges. Use 'Dropped By' to set which boss drops it, and 'Req. Level' to control when it becomes usable."
            />

            {teleportStaff && (
              <div className="flex flex-wrap gap-x-6 gap-y-2 mt-2">
                <div className="flex items-center gap-3">
                  <label htmlFor="teleportStaffDropSource" className="font-cinzel text-[11px] tracking-[0.25em] uppercase text-[#c8a870] whitespace-nowrap">
                    Dropped By
                  </label>
                  <div className="relative">
                    <select
                      id="teleportStaffDropSource"
                      value={teleportStaffDropSource}
                      onChange={e => { setPreset('custom'); setTeleportStaffDropSource(e.target.value); }}
                      className="appearance-none rounded border border-[#3a1510] bg-[#090203] pl-3 pr-7 py-2
                        text-sm text-[#e8d5a0]
                        focus:outline-none focus:border-[#7a3020] focus:ring-1 focus:ring-[#7a3020]/40
                        transition-colors cursor-pointer"
                    >
                      <option value="Corpsefire">Corpsefire</option>
                      <option value="Griswold">Griswold</option>
                      <option value="Coldworm the Burrower">Coldworm the Burrower</option>
                    </select>
                    <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[#7a5818] text-[10px]">▾</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <label htmlFor="teleportStaffLevel" className="font-cinzel text-[11px] tracking-[0.25em] uppercase text-[#c8a870] whitespace-nowrap">
                    Req. Level
                  </label>
                  <div className="relative">
                    <select
                      id="teleportStaffLevel"
                      value={teleportStaffLevel}
                      onChange={e => { setPreset('custom'); setTeleportStaffLevel(Number(e.target.value)); }}
                      className="appearance-none rounded border border-[#3a1510] bg-[#090203] pl-3 pr-7 py-2
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
                    <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[#7a5818] text-[10px]">▾</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right: Horadric Cube */}
          <div className="flex flex-col justify-start">
            <Checkbox
              id="horadricCube"
              checked={horadricCube}
              onChange={field(setHoradricCube)}
              label="Start with Horadric Cube"
              tooltip="Adds a Horadric Cube to your starting inventory, giving you extra stash space from the very beginning."
            />
          </div>
        </div>
      </div>

      {/* Hirelings section */}
      <div className="space-y-3 pt-1 pb-2">
        <SectionDivider label="Mercenaries" />

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Checkbox
            id="hirelingAura"
            checked={hirelingAura}
            onChange={field(setHirelingAura)}
            label="All mercenaries have an aura"
            tooltip="Randomizes each mercenary to grant a random Paladin aura, giving a passive bonus to you and your party."
          />
        </div>
      </div>

      {/* Seed */}
      <div className="space-y-3 pt-1 pb-2">
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
            placeholder="Leave blank for random — or enter a seed to race on the same run"
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
