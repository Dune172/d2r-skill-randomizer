'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import RandomizerApp from './RandomizerApp';
import BuilderApp from './BuilderApp';
import type { BuilderCatalog } from '@/lib/builder/catalog';

type Tab = 'seed' | 'builder';
type Mode = Tab | 'archipelago';

/**
 * The Generate page's modes: a random seed (default), the Class Builder, and, behind
 * the Archipelago toggle, an Archipelago player file (YAML) instead of a mod.
 *
 * All three stay mounted so switching never loses a half-built class, a generated seed
 * or a half-filled player file. Each mode owns the query string while it is shown (seed
 * links carry ?seed=…, builder links ?b=…, Archipelago ?mode=archipelago), so the
 * address bar is always a share link for the visible mode; the other modes' queries are
 * remembered and restored when you switch back.
 */
export default function GenerateModes({ catalog, archipelago }: { catalog: BuilderCatalog; archipelago: ReactNode }) {
  const [mode, setMode] = useState<Mode>('seed');
  // The tab the toggle returns to when it is switched off.
  const lastTab = useRef<Tab>('seed');
  const savedQuery = useRef<Record<Mode, string>>({ seed: '', builder: '?mode=builder', archipelago: '?mode=archipelago' });

  // An opened link belongs to the mode it was made in. Read after mount, not in
  // the state initializer: the page is prerendered without its query string, and
  // hydration keeps the prerendered `hidden` attributes rather than re-rendering
  // them, so an initializer-chosen mode would show the wrong tab in production.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get('mode');
    const opened: Mode = requested === 'archipelago' ? 'archipelago'
      : requested === 'builder' || params.has('b') ? 'builder' : 'seed';
    savedQuery.current[opened] = window.location.search || savedQuery.current[opened];
    if (opened !== 'archipelago') lastTab.current = opened;
    setMode(opened);
  }, []);

  const switchTo = (next: Mode) => {
    if (next === mode) return;
    savedQuery.current[mode] = window.location.search;
    if (next !== 'archipelago') lastTab.current = next;
    window.history.replaceState(null, '', `${window.location.pathname}${savedQuery.current[next]}`);
    setMode(next);
  };

  const apOn = mode === 'archipelago';

  const tab = (id: Tab, label: string) => (
    <button
      type="button"
      role="tab"
      id={`mode-${id}`}
      aria-selected={mode === id}
      aria-controls={`panel-${id}`}
      onClick={() => switchTo(id)}
      className={`px-4 py-2 -mb-px border-b-2 font-cinzel text-[11px] tracking-[0.22em] uppercase transition-colors ${
        mode === id
          ? 'border-[#c8942a] text-[#e8b040]'
          : 'border-transparent text-[#7a5818] hover:text-[#c8942a]'
      }`}
    >
      {label}
    </button>
  );

  return (
    <>
      <div role="tablist" aria-label="Generation mode" className="flex justify-center gap-2 border-b border-[#3a1510] max-w-md mx-auto mt-4">
        {tab('seed', 'Random Seed')}
        {tab('builder', 'Class Builder')}
      </div>

      <div className="flex justify-center mt-4">
        <label className="inline-flex items-center gap-3 cursor-pointer select-none">
          <input
            type="checkbox" role="switch" className="peer sr-only"
            checked={apOn} aria-controls="panel-archipelago"
            onChange={e => switchTo(e.target.checked ? 'archipelago' : lastTab.current)}
          />
          <span
            aria-hidden="true"
            className="relative w-9 h-5 rounded-full border border-[#5a3a14] bg-[#140a04] transition-colors
              peer-checked:bg-[#5c3a10] peer-checked:border-[#c8942a]
              peer-focus-visible:ring-2 peer-focus-visible:ring-[#c8942a]
              after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-3.5 after:h-3.5 after:rounded-full
              after:bg-[#7a5818] after:transition-transform
              peer-checked:after:translate-x-4 peer-checked:after:bg-[#e8b040]"
          />
          <span className="font-cinzel text-[11px] tracking-[0.22em] uppercase text-[#c8942a]">
            Archipelago
            <span className="ml-2 normal-case tracking-normal font-sans text-xs text-[#a89060]">
              make a player YAML instead of a mod
            </span>
          </span>
        </label>
      </div>

      <div role="tabpanel" id="panel-seed" aria-labelledby="mode-seed" hidden={mode !== 'seed'}>
        <RandomizerApp />
      </div>
      <div role="tabpanel" id="panel-builder" aria-labelledby="mode-builder" hidden={mode !== 'builder'}>
        <div className="pt-6">
          <BuilderApp catalog={catalog} />
        </div>
      </div>
      <div id="panel-archipelago" aria-label="Archipelago player file" hidden={!apOn}>
        {archipelago}
      </div>
    </>
  );
}
