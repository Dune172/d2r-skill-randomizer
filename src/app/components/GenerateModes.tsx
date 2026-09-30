'use client';

import { useEffect, useRef, useState } from 'react';
import RandomizerApp from './RandomizerApp';
import BuilderApp from './BuilderApp';
import type { BuilderCatalog } from '@/lib/builder/catalog';

type Mode = 'seed' | 'builder';

/**
 * The Generate page's two modes: a random seed (default) and the Class Builder.
 *
 * Both stay mounted so switching tabs never loses a half-built class or a
 * generated seed. Each mode owns the query string while it is shown (seed links
 * carry ?seed=…, builder links ?b=…), so the address bar is always a share link
 * for the visible mode; the other mode's query is remembered and restored when
 * you switch back.
 */
export default function GenerateModes({ catalog }: { catalog: BuilderCatalog }) {
  const [mode, setMode] = useState<Mode>('seed');
  const savedQuery = useRef<Record<Mode, string>>({ seed: '', builder: '?mode=builder' });

  // An opened link belongs to the mode it was made in. Read after mount, not in
  // the state initializer: the page is prerendered without its query string, and
  // hydration keeps the prerendered `hidden` attributes rather than re-rendering
  // them, so an initializer-chosen mode would show the wrong tab in production.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const opened: Mode = params.get('mode') === 'builder' || params.has('b') ? 'builder' : 'seed';
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

      <div role="tabpanel" id="panel-seed" aria-labelledby="mode-seed" hidden={mode !== 'seed'}>
        <RandomizerApp />
      </div>
      <div role="tabpanel" id="panel-builder" aria-labelledby="mode-builder" hidden={mode !== 'builder'}>
        <div className="pt-6">
          <BuilderApp catalog={catalog} />
        </div>
      </div>
    </>
  );
}
