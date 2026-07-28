'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import RandomizerForm from '@/components/RandomizerForm';
import SkillTreePreview from '@/components/SkillTreePreview';
import ProgressIndicator from '@/components/ProgressIndicator';
import { InstallInstructions } from './InstallInstructions';
import { pickRaceClassName } from '@/lib/classes';
import type { PreviewData } from '@/lib/randomizer/types';

type Status = 'idle' | 'generating' | 'building' | 'ready' | 'error';

interface Options {
  enablePrereqs: boolean;
  playersEnabled: boolean;
  playersCount: number;
  playersActs: number[];
  startingItems: { teleportStaff: boolean; teleportStaffLevel: number; teleportStaffDropSource: string; teleportStaffSpeed: boolean; horadricCube: boolean };
  hirelingAura: boolean;
  disableChat: boolean;
  xpMultiplier: number;
  xpActs: number[];
  xpDifficulties: number[];
  raceMode: boolean;
}

const defaultOptions: Options = {
  enablePrereqs: true,
  playersEnabled: false,
  playersCount: 1,
  playersActs: [1, 2, 3, 4, 5],
  startingItems: { teleportStaff: false, teleportStaffLevel: 1, teleportStaffDropSource: 'Corpsefire', teleportStaffSpeed: true, horadricCube: false },
  hirelingAura: true,
  disableChat: false,
  xpMultiplier: 1,
  xpActs: [1, 2, 3, 4, 5],
  xpDifficulties: [1],
  raceMode: true,
};

function parseOptionsFromParams(p: URLSearchParams | ReturnType<typeof useSearchParams>): Options | null {
  if (!p.has('seed')) return null;
  const playersCount = Math.min(8, Math.max(1, Number(p.get('players')) || 1));
  const staffLevel = Number(p.get('teleportStaff')) || 0;
  return {
    enablePrereqs: p.get('noPrereqs') !== '1',
    playersEnabled: playersCount > 1,
    playersCount,
    playersActs: p.has('acts')
      ? p.get('acts')!.split(',').map(Number).filter(n => n >= 1 && n <= 5)
      : [1, 2, 3, 4, 5],
    startingItems: {
      teleportStaff: staffLevel > 0,
      teleportStaffLevel: staffLevel || 1,
      teleportStaffDropSource: p.get('dropSource') || 'Corpsefire',
      teleportStaffSpeed: p.get('staffSpeed') !== '0',
      horadricCube: p.get('cube') === '1',
    },
    hirelingAura: p.get('hirelingAura') !== '0',
    disableChat: p.get('disableChat') === '1',
    xpMultiplier: Math.min(3, Math.max(1, Number(p.get('xpMultiplier')) || 1)),
    xpActs: p.has('xpActs')
      ? p.get('xpActs')!.split(',').map(Number).filter(n => n >= 1 && n <= 5)
      : [1, 2, 3, 4, 5],
    // Absent on old shared links — those scaled all difficulties, so default to all three.
    xpDifficulties: p.has('xpDifficulties')
      ? p.get('xpDifficulties')!.split(',').map(Number).filter(n => n >= 1 && n <= 3)
      : [1, 2, 3],
    raceMode: p.get('raceMode') !== '0',
  };
}

export default function RandomizerApp() {
  const searchParams = useSearchParams();

  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [currentSeed, setCurrentSeed] = useState<number | null>(null);
  const [modCount, setModCount] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/counter').then(r => r.json()).then(d => setModCount(d.count)).catch(() => {});
  }, []);
  const [currentOptions, setCurrentOptions] = useState<Options>(
    () => parseOptionsFromParams(searchParams) ?? { ...defaultOptions }
  );
  const [seed, setSeed] = useState<string>(() => searchParams.get('seed') ?? '');

  const buildQueryParams = (seed: number, opts: Options = currentOptions) => {
    const playersParam = opts.playersEnabled && opts.playersCount > 1
      ? `&players=${opts.playersCount}`
      : '';
    const staffParam = opts.startingItems.teleportStaff
      ? `&teleportStaff=${opts.startingItems.teleportStaffLevel}&dropSource=${opts.startingItems.teleportStaffDropSource}${opts.startingItems.teleportStaffSpeed ? '' : '&staffSpeed=0'}`
      : '';
    const cubeParam = opts.startingItems.horadricCube ? '&cube=1' : '';
    const actsParam = opts.playersEnabled && opts.playersCount > 1
      ? `&acts=${[...opts.playersActs].sort((a, b) => a - b).join(',')}`
      : '';
    const noPrereqsParam    = !opts.enablePrereqs  ? '&noPrereqs=1'    : '';
    const hirelingAuraParam = !opts.hirelingAura   ? '&hirelingAura=0' : '';
    const disableChatParam  = opts.disableChat     ? '&disableChat=1'  : '';
    const xpParam           = opts.xpMultiplier > 1 ? `&xpMultiplier=${opts.xpMultiplier}` : '';
    const xpActsParam       = opts.xpMultiplier > 1 ? `&xpActs=${[...opts.xpActs].sort((a, b) => a - b).join(',')}` : '';
    const xpDiffParam       = opts.xpMultiplier > 1 ? `&xpDifficulties=${[...opts.xpDifficulties].sort((a, b) => a - b).join(',')}` : '';
    const raceModeParam     = !opts.raceMode ? '&raceMode=0' : '';
    return `seed=${seed}${playersParam}${staffParam}${cubeParam}${actsParam}${noPrereqsParam}${hirelingAuraParam}${disableChatParam}${xpParam}${xpActsParam}${xpDiffParam}${raceModeParam}`;
  };

  const handleGenerate = async (seedInput: string, options: Options) => {
    setCurrentOptions(options);
    setStatus('generating');
    setErrorMessage('');
    setPreview(null);

    try {
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

      const params = buildQueryParams(data.seed, options);
      window.history.replaceState(null, '', `${new URL(window.location.href).pathname}?${params}`);

      setStatus('building');
      const buildingStart = Date.now();
      const buildBody = JSON.stringify({ seed: data.seed, enablePrereqs: options.enablePrereqs, playersEnabled: options.playersEnabled, playersCount: options.playersCount, playersActs: options.playersActs, startingItems: options.startingItems, hirelingAura: options.hirelingAura, disableChat: options.disableChat, xpMultiplier: options.xpMultiplier, xpActs: options.xpActs, xpDifficulties: options.xpDifficulties, raceMode: options.raceMode });

      // Retry up to 2 times on 503 (queue full). Exponential-ish backoff:
      // 3s → 6s. Matches the server-side queue window (~3-5s per gen × 8 deep
      // worst-case). Users see a single "still working" state rather than a
      // toast failure for transient queue pressure.
      let buildRes: Response | null = null;
      let attempt = 0;
      const maxAttempts = 3;
      while (attempt < maxAttempts) {
        buildRes = await fetch('/api/randomize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: buildBody,
        });
        if (buildRes.status !== 503 || attempt === maxAttempts - 1) break;
        attempt++;
        await new Promise(r => setTimeout(r, 3000 * attempt));
      }

      if (!buildRes || !buildRes.ok) {
        const err = buildRes ? await buildRes.json() : { error: 'Build failed' };
        throw new Error(err.error || 'Build failed');
      }

      const elapsed = Date.now() - buildingStart;
      if (elapsed < 6000) await new Promise(r => setTimeout(r, 6000 - elapsed));

      setStatus('ready');
      fetch('/api/counter').then(r => r.json()).then(d => setModCount(d.count)).catch(() => {});
    } catch (err) {
      setStatus('error');
      setErrorMessage(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  const handleDownload = () => {
    if (currentSeed === null) return;
    window.open(`/api/download?${buildQueryParams(currentSeed)}`, '_blank');
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 md:py-8 space-y-6">
      {/* ── Form panel ── */}
      <div className="rounded-lg border border-[#4a1e14] bg-[#0c0405]/80 p-4 md:p-6 panel-shadow">
        <RandomizerForm
          initialOptions={parseOptionsFromParams(searchParams) ?? undefined}
          onGenerate={handleGenerate}
          isLoading={status === 'generating' || status === 'building'}
          seed={seed}
          onSeedChange={setSeed}
          hideSubmit={status === 'ready'}
        />

        {status === 'ready' && (
          <div className="pt-3 space-y-3">
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

            {currentOptions.raceMode && currentSeed !== null && (
              <div className="rounded p-3 bg-[#0a2010]/60 border border-[#2a5a2a] text-center space-y-1">
                <div className="font-cinzel font-bold tracking-[0.22em] text-sm uppercase text-[#c8942a]">
                  Race Class: {pickRaceClassName(currentSeed)}
                </div>
                <div className="text-[11px] text-[#6abf6a]">
                  Everyone on this seed plays the {pickRaceClassName(currentSeed)}. All other classes are Prayer filler.
                </div>
              </div>
            )}

            <div className="pt-0.5">
              <InstallInstructions seed={currentSeed!} raceMode={currentOptions.raceMode} />
            </div>
          </div>
        )}

        {status !== 'idle' && (
          <div className="flex justify-center pt-3">
            <ProgressIndicator status={status} message={errorMessage} />
          </div>
        )}
      </div>

      {preview && !currentOptions.raceMode && (
        <SkillTreePreview data={preview} />
      )}

      <p className="text-center text-sm text-amber-700/80 pt-4">
        <a
          href="https://discord.gg/y5r2sTxwS5"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-amber-500 transition-colors"
        >
          Join the Discord
        </a>
        {" "}to find race partners, share seeds, and submit run times.
      </p>

      <p className="text-center font-cinzel text-[11px] tracking-[0.3em] uppercase text-[#7a5818] pt-2">
        {modCount !== null ? <>{modCount.toLocaleString()} mods generated &mdash; </> : null}v0.257: updated July 2026
      </p>
    </div>
  );
}
