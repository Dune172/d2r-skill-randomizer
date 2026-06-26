'use client';

import { useState, useEffect, useRef } from 'react';

type Preset = 'custom' | 'season1race' | 'turbo';

interface FormState {
  enablePrereqs: boolean;
  playersCount: number;
  playersActs: number[];
  teleportStaff: boolean;
  teleportStaffLevel: number;
  teleportStaffDropSource: string;
  teleportStaffSpeed: boolean;
  horadricCube: boolean;
  hirelingAura: boolean;
  disableChat: boolean;
  xpMultiplier: number;
  xpActs: number[];
  xpDifficulties: number[];
  raceMode: boolean;
}

const SEASON1_PRESET: FormState = {
  enablePrereqs: true,
  playersCount: 1,
  playersActs: [1, 2, 3, 4, 5],
  teleportStaff: true,
  teleportStaffLevel: 18,
  teleportStaffDropSource: 'Corpsefire',
  teleportStaffSpeed: false,
  horadricCube: false,
  hirelingAura: true,
  disableChat: false,
  xpMultiplier: 1.5,
  xpActs: [1, 2],
  xpDifficulties: [1],
  raceMode: true,
};

const TURBO_PRESET: FormState = {
  enablePrereqs: true,
  playersCount: 1,
  playersActs: [1, 2, 3, 4, 5],
  teleportStaff: true,
  teleportStaffLevel: 6,
  teleportStaffDropSource: 'Corpsefire',
  teleportStaffSpeed: true,
  horadricCube: true,
  hirelingAura: true,
  disableChat: false,
  xpMultiplier: 3,
  xpActs: [1, 2, 3, 4, 5],
  xpDifficulties: [1, 2, 3],
  raceMode: false,
};

const DEFAULT_STATE: FormState = {
  enablePrereqs: true,
  playersCount: 1,
  playersActs: [1, 2, 3, 4, 5],
  teleportStaff: false,
  teleportStaffLevel: 1,
  teleportStaffDropSource: 'Corpsefire',
  teleportStaffSpeed: true,
  horadricCube: false,
  hirelingAura: true,
  disableChat: false,
  xpMultiplier: 1,
  xpActs: [1, 2, 3, 4, 5],
  xpDifficulties: [1],
  raceMode: true,
};

interface RandomizerFormProps {
  initialOptions?: { enablePrereqs: boolean; playersEnabled: boolean; playersCount: number; playersActs: number[]; startingItems: { teleportStaff: boolean; teleportStaffLevel: number; teleportStaffDropSource: string; teleportStaffSpeed: boolean; horadricCube: boolean }; hirelingAura: boolean; disableChat: boolean; xpMultiplier: number; xpActs: number[]; xpDifficulties: number[]; raceMode: boolean };
  onGenerate: (seed: string, options: { enablePrereqs: boolean; playersEnabled: boolean; playersCount: number; playersActs: number[]; startingItems: { teleportStaff: boolean; teleportStaffLevel: number; teleportStaffDropSource: string; teleportStaffSpeed: boolean; horadricCube: boolean }; hirelingAura: boolean; disableChat: boolean; xpMultiplier: number; xpActs: number[]; xpDifficulties: number[]; raceMode: boolean }) => void;
  isLoading: boolean;
  seed: string;
  onSeedChange: (s: string) => void;
  hideSubmit?: boolean;
}

function Tip({ text, align = 'center', width = 'w-56', below = false }: { text: string; align?: 'center' | 'right'; width?: string; below?: boolean }) {
  // Hover reveals on desktop; tap toggles `open` so the tooltip is reachable on touch.
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const pos = below ? 'top-full mt-2' : 'bottom-full mb-2';
  const alignCls = align === 'right' ? 'right-0' : 'left-1/2 -translate-x-1/2';

  return (
    <span ref={ref} className="relative group/tip inline-flex items-center ml-1.5">
      <button
        type="button"
        aria-label="More information"
        onClick={e => { e.preventDefault(); e.stopPropagation(); setOpen(o => !o); }}
        className="text-[#5a3820] hover:text-[#c8a870] text-[11px] leading-none select-none transition-colors cursor-help"
      >
        ⓘ
      </button>
      <span className={`pointer-events-none absolute ${pos} ${alignCls} z-20 ${width} rounded border border-[#3a1510] bg-[#0d0305] px-2.5 py-1.5 text-xs text-[#c8a870] leading-relaxed shadow-lg transition-opacity duration-150 text-left whitespace-normal group-hover/tip:opacity-100 ${open ? 'opacity-100' : 'opacity-0'}`}>
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
  label = 'Acts',
  labels = ['I', 'II', 'III', 'IV', 'V'],
}: {
  acts: readonly number[];
  selected: number[];
  onToggle: (act: number) => void;
  label?: string;
  labels?: readonly string[];
}) {
  const actLabels = labels;
  return (
    <div className="ml-1 pl-3 border-l-2 border-[#7a1010]/60 mt-2">
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-[#c8a870] font-cinzel tracking-wide mr-0.5">{label}</span>
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

export default function RandomizerForm({ initialOptions, onGenerate, isLoading, seed, onSeedChange, hideSubmit }: RandomizerFormProps) {
  const [preset, setPreset] = useState<Preset>(initialOptions ? 'custom' : 'season1race');
  const [enablePrereqs, setEnablePrereqs] = useState(initialOptions?.enablePrereqs ?? SEASON1_PRESET.enablePrereqs);
  const [playersCount, setPlayersCount] = useState(initialOptions?.playersCount ?? SEASON1_PRESET.playersCount);
  const [playersActs, setPlayersActs] = useState<number[]>(initialOptions?.playersActs ?? SEASON1_PRESET.playersActs);
  const [teleportStaff, setTeleportStaff] = useState(initialOptions?.startingItems.teleportStaff ?? SEASON1_PRESET.teleportStaff);
  const [teleportStaffLevel, setTeleportStaffLevel] = useState(initialOptions?.startingItems.teleportStaffLevel ?? SEASON1_PRESET.teleportStaffLevel);
  const [teleportStaffDropSource, setTeleportStaffDropSource] = useState(initialOptions?.startingItems.teleportStaffDropSource ?? SEASON1_PRESET.teleportStaffDropSource);
  const [teleportStaffSpeed, setTeleportStaffSpeed] = useState(initialOptions?.startingItems.teleportStaffSpeed ?? SEASON1_PRESET.teleportStaffSpeed);
  const [horadricCube, setHoradricCube] = useState(initialOptions?.startingItems.horadricCube ?? SEASON1_PRESET.horadricCube);
  const [hirelingAura, setHirelingAura] = useState(initialOptions?.hirelingAura ?? SEASON1_PRESET.hirelingAura);
  const [disableChat, setDisableChat] = useState(initialOptions?.disableChat ?? SEASON1_PRESET.disableChat);
  const [xpMultiplier, setXpMultiplier] = useState(initialOptions?.xpMultiplier ?? SEASON1_PRESET.xpMultiplier);
  const [xpActs, setXpActs] = useState<number[]>(initialOptions?.xpActs ?? SEASON1_PRESET.xpActs);
  const [xpDifficulties, setXpDifficulties] = useState<number[]>(initialOptions?.xpDifficulties ?? SEASON1_PRESET.xpDifficulties);
  const [raceMode, setRaceMode] = useState(initialOptions?.raceMode ?? SEASON1_PRESET.raceMode);
  const applyPreset = (p: Preset) => {
    setPreset(p);
    const src = p === 'season1race' ? SEASON1_PRESET : p === 'turbo' ? TURBO_PRESET : null;
    if (src) {
      setEnablePrereqs(src.enablePrereqs);
      setPlayersCount(src.playersCount);
      setPlayersActs(src.playersActs);
      setTeleportStaff(src.teleportStaff);
      setTeleportStaffLevel(src.teleportStaffLevel);
      setTeleportStaffDropSource(src.teleportStaffDropSource);
      setTeleportStaffSpeed(src.teleportStaffSpeed);
      setHoradricCube(src.horadricCube);
      setHirelingAura(src.hirelingAura);
      setDisableChat(src.disableChat);
      setXpMultiplier(src.xpMultiplier);
      setXpActs(src.xpActs);
      setXpDifficulties(src.xpDifficulties);
      setRaceMode(src.raceMode);
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

  const toggleXpDifficulty = (diff: number) => {
    setPreset('custom');
    setXpDifficulties(prev => prev.includes(diff) ? prev.filter(d => d !== diff) : [...prev, diff]);
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
      startingItems: { teleportStaff, teleportStaffLevel, teleportStaffDropSource, teleportStaffSpeed, horadricCube },
      hirelingAura,
      disableChat,
      xpMultiplier,
      xpActs,
      xpDifficulties,
      raceMode,
    });
  };

  const presetDesc =
    preset === 'season1race'
      ? 'Season Beta Race: Competitive preset for Normal difficulty Baal kill races. This is a beta, any and all feedback is appreciated!'
      : preset === 'turbo'
        ? 'Turbo: A power-levelling preset — 3× XP across all acts, Horadric Cube from the start, a Teleport Staff (req. level 6) dropped by Corpsefire, +15% Faster Run/Walk, and auras on all mercenaries.'
        : null;

  return (
    <form onSubmit={handleSubmit} className="space-y-1">

      {/* Preset */}
      <div className="flex items-center justify-end gap-2 pb-0">
        <label htmlFor="preset" className="font-cinzel text-[11px] tracking-[0.25em] uppercase text-[#c8a870] flex items-center">
          Preset
          {presetDesc && <Tip text={presetDesc} align="right" width="w-72" below />}
        </label>
        <div className="relative">
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
            <option value="turbo" title="Turbo: A power-levelling preset — 3× XP across all acts, Horadric Cube from the start, a Teleport Staff (req. level 6) dropped by Corpsefire, +15% Faster Run/Walk, and auras on all mercenaries.">Turbo</option>
          </select>
          <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[#7a5818] text-[10px]">▾</div>
        </div>
      </div>

      {/* Gameplay section */}
      <div className="space-y-3 pt-1 pb-2">
        <SectionDivider label="Gameplay" />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
          {/* Left: Disable chat + Prereqs + Proc pool */}
          <div className="flex flex-col justify-start gap-3">
            <Checkbox
              id="disableChat"
              checked={disableChat}
              onChange={field(setDisableChat)}
              label="Disable chat"
              tooltip="Removes the in-game chat box. Keeps the screen clean during races and prevents /players from being used."
            />
            <Checkbox
              id="enablePrereqs"
              checked={!enablePrereqs}
              onChange={v => field(setEnablePrereqs)(!v)}
              label="No skill prerequisites"
              tooltip="Removes skill prerequisites, letting you invest points in any skill freely without unlocking earlier ones first."
            />

          </div>

          {/* Right: XP Boost */}
          <div className="flex flex-col justify-start gap-3">
            <div>
              <div className="flex items-center gap-2.5">
                <label htmlFor="xpMultiplier" className="text-sm text-[#c8a870] whitespace-nowrap flex items-center">
                  XP Boost
                  <Tip text="Multiplies experience gained from monsters. Select which acts and difficulties it applies to below." />
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
                <>
                  <ActPillRow acts={[1, 2, 3, 4, 5]} selected={xpActs} onToggle={toggleXpAct} />
                  <ActPillRow
                    acts={[1, 2, 3]}
                    selected={xpDifficulties}
                    onToggle={toggleXpDifficulty}
                    label="Diff"
                    labels={['Normal', 'NM', 'Hell']}
                  />
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Items section */}
      <div className="space-y-3 pt-1 pb-2">
        <SectionDivider label="Items" />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Left: Teleport Staff */}
          <div className={teleportStaff ? 'rounded border border-[#5c1818] bg-[#1a0606]/50 p-3 -m-3 w-fit justify-self-start' : ''}>
            <Checkbox
              id="teleportStaff"
              checked={teleportStaff}
              onChange={field(setTeleportStaff)}
              label="Teleport Staff"
              tooltip="Starts you with a staff that has Teleport charges. Use 'Dropped By' to set which boss drops it, and 'Req. Level' to control when it becomes usable."
            />

            {teleportStaff && (
              <>
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
                <div className="mt-2">
                  <Checkbox
                    id="teleportStaffSpeed"
                    checked={teleportStaffSpeed}
                    onChange={field(setTeleportStaffSpeed)}
                    label="+15% Faster Run/Walk"
                    tooltip="Adds a +15% Faster Run/Walk bonus to the staff. Disabled in race presets to keep movement speed competitive."
                  />
                </div>
              </>
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
        <Checkbox
          id="raceMode"
          checked={raceMode}
          onChange={field(setRaceMode)}
          label="Race Mode"
          tooltip="Includes -seed in the launch shortcut and manual args, locking the map seed so all racers see the same maps. Also hides the spoiler so the randomized skill trees stay secret."
        />
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
      {!hideSubmit && (
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
          <p className="mt-2 text-center text-[11px] text-[#8a7040] italic">
            Requires the Reign of the Warlock expansion.
          </p>
        </div>
      )}
    </form>
  );
}
