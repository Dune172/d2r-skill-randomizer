'use client';

import { useState } from 'react';
import RandomizerForm from '@/components/RandomizerForm';
import SkillTreePreview from '@/components/SkillTreePreview';
import ProgressIndicator from '@/components/ProgressIndicator';
import type { PreviewData } from '@/lib/randomizer/types';

type Status = 'idle' | 'generating' | 'building' | 'ready' | 'error';

interface Options {
  enablePrereqs: boolean;
  logic: 'minimal' | 'normal';
  playersEnabled: boolean;
  playersCount: number;
  startingItems: { teleportStaff: boolean; teleportStaffLevel: number };
}

export default function Home() {
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [currentSeed, setCurrentSeed] = useState<number | null>(null);
  const [currentOptions, setCurrentOptions] = useState<Options>({ enablePrereqs: true, logic: 'normal', playersEnabled: false, playersCount: 1, startingItems: { teleportStaff: false, teleportStaffLevel: 1 } });
  // Seed state owned here so we can update the textbox after generation
  const [seed, setSeed] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return new URLSearchParams(window.location.search).get('seed') ?? '';
  });

  const handleGenerate = async (seedInput: string, options: Options) => {
    setCurrentOptions(options);
    setStatus('generating');
    setErrorMessage('');
    setPreview(null);

    try {
      // Step 1: Generate preview
      const previewRes = await fetch('/api/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seed: seedInput }),
      });

      if (!previewRes.ok) {
        const err = await previewRes.json();
        throw new Error(err.error || 'Preview failed');
      }

      const data: PreviewData = await previewRes.json();
      setPreview(data);
      setCurrentSeed(data.seed);
      setSeed(String(data.seed));

      // Update URL so this result is shareable
      const url = new URL(window.location.href);
      url.searchParams.set('seed', String(data.seed));
      window.history.replaceState(null, '', url.toString());

      // Step 2: Build the mod
      setStatus('building');
      const buildRes = await fetch('/api/randomize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seed: data.seed, enablePrereqs: options.enablePrereqs, logic: options.logic, playersEnabled: options.playersEnabled, playersCount: options.playersCount, startingItems: options.startingItems }),
      });

      if (!buildRes.ok) {
        const err = await buildRes.json();
        throw new Error(err.error || 'Build failed');
      }

      setStatus('ready');
    } catch (err) {
      setStatus('error');
      setErrorMessage(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  const handleDownload = () => {
    if (currentSeed === null) return;
    const playersParam = currentOptions.playersEnabled && currentOptions.playersCount > 1
      ? `&players=${currentOptions.playersCount}`
      : '';
    const staffParam = currentOptions.startingItems.teleportStaff
      ? `&teleportStaff=${currentOptions.startingItems.teleportStaffLevel}`
      : '';
    window.open(`/api/download?seed=${currentSeed}${playersParam}${staffParam}`, '_blank');
  };

  return (
    <main className="min-h-screen">
      {/* ── Header ── */}
      <header className="border-b border-[#3a1510] bg-[#080204]/90 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 py-7">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[#7a5818] to-[#c8942a]" />
            <span className="text-[#c8942a] text-xs">◆</span>
            <div className="flex-1 h-px bg-gradient-to-l from-transparent via-[#7a5818] to-[#c8942a]" />
          </div>

          <h1 className="font-cinzel font-black tracking-[0.18em] text-4xl md:text-5xl text-[#c8942a] glow-gold uppercase text-center mb-2">
            D2R Randomizer
          </h1>
          <p className="font-cinzel tracking-[0.45em] text-[11px] text-[#a87830] uppercase text-center">
            Reign of the Warlock
          </p>
          <p className="text-center mt-2">
            <a
              href="https://ko-fi.com/YOUR_HANDLE"
              target="_blank"
              rel="noopener noreferrer"
              className="font-cinzel text-[10px] tracking-[0.2em] text-[#7a5818] hover:text-[#c8942a] transition-colors uppercase"
            >
              ☕ Support on Ko-fi
            </a>
          </p>

          <div className="flex items-center gap-3 mt-4">
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[#7a5818] to-[#c8942a]" />
            <span className="text-[#c8942a] text-xs">◆</span>
            <div className="flex-1 h-px bg-gradient-to-l from-transparent via-[#7a5818] to-[#c8942a]" />
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
        {/* ── Form panel ── */}
        <div className="rounded-lg border border-[#4a1e14] bg-[#0c0405]/80 p-6 panel-shadow">
          <RandomizerForm
            onGenerate={handleGenerate}
            isLoading={status === 'generating' || status === 'building'}
            seed={seed}
            onSeedChange={setSeed}
          />
          {status === 'ready' && (
            <div className="pt-3">
              <button
                onClick={handleDownload}
                className="w-full rounded py-3
                  font-cinzel font-bold tracking-[0.22em] text-sm uppercase text-[#c8d8f8]
                  bg-gradient-to-b from-[#121838] to-[#0a1028]
                  border border-[#283878]
                  hover:from-[#1a2448] hover:to-[#101830] hover:border-[#4858c0]
                  transition-all duration-200
                  shadow-[0_0_16px_rgba(40,56,120,0.30)] hover:shadow-[0_0_28px_rgba(72,88,192,0.42)]"
              >
                Download Zip
              </button>
            </div>
          )}
        </div>

        <ProgressIndicator status={status} message={errorMessage} />

        {preview && (
          <SkillTreePreview data={preview} />
        )}
      </div>
    </main>
  );
}
