'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import RandomizerApp from './RandomizerApp';
import BuilderApp from './BuilderApp';
import type { BuilderCatalog } from '@/lib/builder/catalog';

type Mode = 'seed' | 'builder' | 'archipelago';

/**
 * The Generate page's three modes: a random seed (default), the Class Builder, and
 * Archipelago, which makes a player file (YAML) instead of a mod.
 *
 * All stay mounted so switching tabs never loses a half-built class, a generated seed
 * or a half-filled player file. Each mode owns the query string while it is shown (seed
 * links carry ?seed=…, builder links ?b=…, Archipelago ?mode=archipelago), so the
 * address bar is always a share link for the visible mode; the other modes' queries are
 * remembered and restored when you switch back.
 */
export default function GenerateModes({ catalog, archipelago }: { catalog: BuilderCatalog; archipelago: ReactNode }) {
  const [mode, setMode] = useState<Mode>('seed');
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
    setMode(opened);
  }, []);

  const switchTo = (next: Mode) => {
    if (next === mode) return;
    savedQuery.current[mode] = window.location.search;
    window.history.replaceState(null, '', `${window.location.pathname}${savedQuery.current[next]}`);
    setMode(next);
  };

  const tab = (id: Mode, label: string) => (
    <button
      type="button"
      role="tab"
      id={`mode-${id}`}
      aria-selected={mode === id}
      aria-controls={`panel-${id}`}
      onClick={() => switchTo(id)}
      className={`px-3 sm:px-4 py-2 -mb-px border-b-2 font-cinzel text-[11px] tracking-[0.18em] sm:tracking-[0.22em] uppercase transition-colors ${
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
      <div role="tablist" aria-label="Generation mode" className="flex justify-center gap-1 sm:gap-2 border-b border-[#3a1510] max-w-lg mx-auto mt-4">
        {tab('seed', 'Random Seed')}
        {tab('builder', 'Class Builder')}
        {tab('archipelago', 'Archipelago')}
      </div>

      <div role="tabpanel" id="panel-seed" aria-labelledby="mode-seed" hidden={mode !== 'seed'}>
        <RandomizerApp />
      </div>
      <div role="tabpanel" id="panel-builder" aria-labelledby="mode-builder" hidden={mode !== 'builder'}>
        <div className="pt-6">
          <BuilderApp catalog={catalog} />
        </div>
      </div>
      <div role="tabpanel" id="panel-archipelago" aria-labelledby="mode-archipelago" hidden={mode !== 'archipelago'}>
        {archipelago}
      </div>
    </>
  );
}
