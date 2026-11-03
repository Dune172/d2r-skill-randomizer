'use client';

import { useState } from 'react';
import { SITE_VERSION } from '@/lib/site-version';

/**
 * One click copies what a bug report needs: site version, mod folder, seed and the
 * link that regenerates this exact mod (every page keeps its options in the URL).
 */
export function CopySeedInfo({ mod, seed, label, link }: {
  mod: string;
  seed: number;
  /** e.g. "Challenge 17: Return to Tristram"; omitted for generated seeds. */
  label?: string;
  /** Defaults to the current page URL. */
  link?: string;
}) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  // Shown for copying by hand when the browser refuses clipboard access.
  const [fallback, setFallback] = useState<string | null>(null);

  const text = () => [
    `D2R Randomizer ${SITE_VERSION}`,
    label,
    `Mod folder: ${mod}`,
    `Seed: ${seed}`,
    `Link: ${link ?? window.location.href}`,
    `Generated: ${new Date().toISOString().slice(0, 10)}`,
  ].filter(Boolean).join('\n');

  const copy = async () => {
    const info = text();
    try {
      await navigator.clipboard.writeText(info);
      setState('copied');
      setFallback(null);
      setTimeout(() => setState('idle'), 4000);
    } catch {
      setState('failed');
      setFallback(info);
    }
  };

  return (
    <div className="space-y-1.5 text-xs text-[#7a7858]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <button
          type="button"
          onClick={copy}
          className="rounded border border-[#3a1510] px-2.5 py-1 text-[#c8a870] hover:border-[#7a3020] hover:text-[#e8d5a0] transition-colors"
        >
          {state === 'copied' ? 'Copied' : 'Copy seed info'}
        </button>
        <span aria-live="polite">
          {state === 'failed'
            ? 'Your browser blocked the copy. Select the text below and copy it yourself.'
            : 'Found a bug? Paste this into #bug-report on Discord along with what happened.'}
        </span>
      </div>
      {fallback && (
        <textarea
          readOnly
          aria-label="Seed info"
          value={fallback}
          rows={fallback.split('\n').length}
          onFocus={e => e.currentTarget.select()}
          className="w-full rounded border border-[#3a1510] bg-[#090203] px-2 py-1.5 font-mono text-[11px] text-[#e8d5a0] resize-none"
        />
      )}
    </div>
  );
}
