'use client';

import { useState } from 'react';
import { Tip, Checkbox, ActPillRow, SectionDivider } from './FormControls';
import type { ModOptions } from '@/lib/builder/mod-options';

const SELECT_CLASS =
  'appearance-none rounded border border-[#3a1510] bg-[#090203] pl-3 pr-7 py-1.5 text-sm text-[#e8d5a0] ' +
  'focus:outline-none focus:border-[#7a3020] focus:ring-1 focus:ring-[#7a3020]/40 transition-colors cursor-pointer';

function Select({ id, value, onChange, children }: {
  id: string;
  value: string | number;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <select id={id} value={value} onChange={e => onChange(e.target.value)} className={SELECT_CLASS}>
        {children}
      </select>
      <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[#7a5818] text-[10px]">▾</div>
    </div>
  );
}

/**
 * Gameplay options for a Class Builder build — the same set the seed generator
 * offers, minus Race Mode (its Prayer filler would erase the hand-built class).
 */
export default function BuildOptionsPanel({
  value,
  onChange,
  defaultOpen = false,
}: {
  value: ModOptions;
  onChange: (next: ModOptions) => void;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  const set = <K extends keyof ModOptions>(key: K, v: ModOptions[K]) => onChange({ ...value, [key]: v });
  const setItem = <K extends keyof ModOptions['startingItems']>(key: K, v: ModOptions['startingItems'][K]) =>
    onChange({ ...value, startingItems: { ...value.startingItems, [key]: v } });

  const toggleIn = (list: number[], n: number) =>
    list.includes(n) ? list.filter(x => x !== n) : [...list, n];

  // A short summary so the collapsed panel still shows what is on.
  const summary = [
    !value.enablePrereqs && 'no prerequisites',
    value.playersEnabled && value.playersCount > 1 && `players ${value.playersCount}`,
    value.xpMultiplier > 1 && `${value.xpMultiplier}× XP`,
    value.startingItems.teleportStaff && 'teleport staff',
    value.startingItems.horadricCube && 'cube',
    !value.hirelingAura && 'no merc aura',
    value.disableChat && 'chat off',
    value.enemyShuffle && 'monster shuffle',
  ].filter(Boolean).join(' · ');

  return (
    <div className="rounded-lg border border-[#3a1510] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full px-4 py-2.5 bg-[#160607] flex items-center justify-between gap-3 text-left"
      >
        <span className="font-cinzel font-bold text-[11px] tracking-[0.18em] uppercase text-[#c8942a]">
          Game options
        </span>
        <span className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] text-[#7a6a4a] truncate">{summary || 'defaults'}</span>
          <span className={`text-[#c8942a] text-[14px] transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>▾</span>
        </span>
      </button>

      {open && (
        <div className="p-4 space-y-4 bg-[#0c0405]">
          <SectionDivider label="Gameplay" />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <Checkbox
                id="b-enemies"
                checked={value.enemyShuffle}
                onChange={v => set('enemyShuffle', v)}
                label="Monster shuffle"
                tooltip="Ordinary enemy families move between acts, with stats and rewards balanced for their new areas. Bosses and scripted encounters stay in place."
              />
              <Checkbox
                id="b-prereqs"
                checked={value.enablePrereqs}
                onChange={v => set('enablePrereqs', v)}
                label="Skill prerequisites"
                tooltip="Keeps the arrow requirements shown on each tree. Turn off to spend points anywhere immediately."
              />

              <div className="flex items-center gap-2.5">
                <label htmlFor="b-players" className="text-sm text-[#c8a870] whitespace-nowrap flex items-center">
                  Players count
                  <Tip text="Simulates a multiplayer game: more monster health and better drops." />
                </label>
                <Select
                  id="b-players"
                  value={value.playersEnabled ? value.playersCount : 1}
                  onChange={v => {
                    const n = Number(v);
                    onChange({ ...value, playersCount: n, playersEnabled: n > 1 });
                  }}
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8].map(n => <option key={n} value={n}>{n}</option>)}
                </Select>
              </div>
              {value.playersEnabled && value.playersCount > 1 && (
                <ActPillRow
                  acts={[1, 2, 3, 4, 5]}
                  selected={value.playersActs}
                  onToggle={a => set('playersActs', toggleIn(value.playersActs, a))}
                />
              )}
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2.5">
                <label htmlFor="b-xp" className="text-sm text-[#c8a870] whitespace-nowrap flex items-center">
                  XP Boost
                  <Tip text="Multiplies experience gained from monsters. Choose which acts and difficulties it applies to." />
                </label>
                <Select id="b-xp" value={value.xpMultiplier} onChange={v => set('xpMultiplier', Number(v))}>
                  {[1, 1.5, 2, 2.5, 3].map(n => <option key={n} value={n}>{n}×</option>)}
                </Select>
              </div>
              {value.xpMultiplier > 1 && (
                <>
                  <ActPillRow
                    acts={[1, 2, 3, 4, 5]}
                    selected={value.xpActs}
                    onToggle={a => set('xpActs', toggleIn(value.xpActs, a))}
                  />
                  <ActPillRow
                    acts={[1, 2, 3]}
                    selected={value.xpDifficulties}
                    onToggle={d => set('xpDifficulties', toggleIn(value.xpDifficulties, d))}
                    label="Diff"
                    labels={['Normal', 'NM', 'Hell']}
                  />
                </>
              )}
            </div>
          </div>

          <SectionDivider label="Items" />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className={value.startingItems.teleportStaff ? 'rounded border border-[#5c1818] bg-[#1a0606]/50 p-3 w-fit' : ''}>
              <Checkbox
                id="b-staff"
                checked={value.startingItems.teleportStaff}
                onChange={v => setItem('teleportStaff', v)}
                label="Teleport Staff"
                tooltip="Adds a staff with Teleport charges to a boss's drop. Handy when the shuffle leaves you without movement."
              />
              {value.startingItems.teleportStaff && (
                <div className="mt-3 space-y-2">
                  <div className="flex items-center gap-3">
                    <label htmlFor="b-drop" className="font-cinzel text-[10px] tracking-[0.2em] uppercase text-[#c8a870] whitespace-nowrap">
                      Dropped By
                    </label>
                    <Select
                      id="b-drop"
                      value={value.startingItems.teleportStaffDropSource}
                      onChange={v => setItem('teleportStaffDropSource', v)}
                    >
                      <option value="Corpsefire">Corpsefire</option>
                      <option value="Griswold">Griswold</option>
                      <option value="Coldworm the Burrower">Coldworm the Burrower</option>
                    </Select>
                  </div>
                  <div className="flex items-center gap-3">
                    <label htmlFor="b-stafflvl" className="font-cinzel text-[10px] tracking-[0.2em] uppercase text-[#c8a870] whitespace-nowrap">
                      Req. Level
                    </label>
                    <Select
                      id="b-stafflvl"
                      value={value.startingItems.teleportStaffLevel}
                      onChange={v => setItem('teleportStaffLevel', Number(v))}
                    >
                      {[1, 6, 12, 18, 24].map(n => <option key={n} value={n}>{n}</option>)}
                    </Select>
                  </div>
                  <Checkbox
                    id="b-staffspeed"
                    checked={value.startingItems.teleportStaffSpeed}
                    onChange={v => setItem('teleportStaffSpeed', v)}
                    label="Faster cast rate"
                  />
                </div>
              )}
            </div>

            <div className="space-y-3">
              <Checkbox
                id="b-cube"
                checked={value.startingItems.horadricCube}
                onChange={v => setItem('horadricCube', v)}
                label="Start with Horadric Cube"
                tooltip="Puts the Cube in your inventory from level 1."
              />
              <Checkbox
                id="b-merc"
                checked={value.hirelingAura}
                onChange={v => set('hirelingAura', v)}
                label="Randomize mercenary aura"
                tooltip="Gives Act 2 mercenaries a random aura from the shuffled pool instead of their vanilla one."
              />
              <Checkbox
                id="b-chat"
                checked={value.disableChat}
                onChange={v => set('disableChat', v)}
                label="Hide chat panel"
                tooltip="Removes the in-game chat UI. Useful for recording."
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
