'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import RandomizerForm from '@/components/RandomizerForm';
import SkillTreePreview from '@/components/SkillTreePreview';
import ProgressIndicator from '@/components/ProgressIndicator';
import type { PreviewData } from '@/lib/randomizer/types';

type Status = 'idle' | 'generating' | 'building' | 'ready' | 'error';

interface Options {
  enablePrereqs: boolean;
  playersEnabled: boolean;
  playersCount: number;
  playersActs: number[];
  startingItems: { teleportStaff: boolean; teleportStaffLevel: number; teleportStaffDropSource: string; horadricCube: boolean };
  hirelingAura: boolean;
  disableChat: boolean;
  xpMultiplier: number;
  xpActs: number[];
}

const defaultOptions: Options = {
  enablePrereqs: true,
  playersEnabled: false,
  playersCount: 1,
  playersActs: [1, 2, 3, 4, 5],
  startingItems: { teleportStaff: false, teleportStaffLevel: 1, teleportStaffDropSource: 'Corpsefire', horadricCube: false },
  hirelingAura: true,
  disableChat: false,
  xpMultiplier: 1,
  xpActs: [1, 2, 3, 4, 5],
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
      horadricCube: p.get('cube') === '1',
    },
    hirelingAura: p.get('hirelingAura') !== '0',
    disableChat: p.get('disableChat') === '1',
    xpMultiplier: Math.min(3, Math.max(1, Number(p.get('xpMultiplier')) || 1)),
    xpActs: p.has('xpActs')
      ? p.get('xpActs')!.split(',').map(Number).filter(n => n >= 1 && n <= 5)
      : [1, 2, 3, 4, 5],
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
      ? `&teleportStaff=${opts.startingItems.teleportStaffLevel}&dropSource=${opts.startingItems.teleportStaffDropSource}`
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
    return `seed=${seed}${playersParam}${staffParam}${cubeParam}${actsParam}${noPrereqsParam}${hirelingAuraParam}${disableChatParam}${xpParam}${xpActsParam}`;
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
      const buildRes = await fetch('/api/randomize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seed: data.seed, enablePrereqs: options.enablePrereqs, playersEnabled: options.playersEnabled, playersCount: options.playersCount, playersActs: options.playersActs, startingItems: options.startingItems, hirelingAura: options.hirelingAura, disableChat: options.disableChat, xpMultiplier: options.xpMultiplier, xpActs: options.xpActs }),
      });

      if (!buildRes.ok) {
        const err = await buildRes.json();
        throw new Error(err.error || 'Build failed');
      }

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
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      {/* ── Form panel ── */}
      <div className="rounded-lg border border-[#4a1e14] bg-[#0c0405]/80 p-6 panel-shadow">
        <RandomizerForm
          initialOptions={parseOptionsFromParams(searchParams) ?? undefined}
          onGenerate={handleGenerate}
          isLoading={status === 'generating' || status === 'building'}
          seed={seed}
          onSeedChange={setSeed}
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

            <div className="grid grid-cols-2 gap-3 pt-0.5 text-xs text-[#c8a870]">
              {/* Battle.net column */}
              <div className="space-y-2 border border-[#2a1508]/60 rounded p-3 bg-[#080203]/40">
                <p className="font-cinzel text-[11px] tracking-[0.22em] uppercase text-[#c8942a] mb-2">Battle.net</p>
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full border border-[#c8942a] text-[#c8942a] text-[10px] font-bold flex-shrink-0 mt-0.5">1</span>
                    <span>Extract the ZIP anywhere — your Desktop is fine.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full border border-[#c8942a] text-[#c8942a] text-[10px] font-bold flex-shrink-0 mt-0.5">2</span>
                    <div>
                      In your D2R install folder, open or create a{' '}
                      <code className="text-[#a89858]">mods\</code>
                      {' '}folder.
                      <div className="mt-1 text-[#7a7858]">Default location: <code className="text-[#7a7858] break-all">C:\Program Files (x86)\Diablo II Resurrected\</code></div>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full border border-[#c8942a] text-[#c8942a] text-[10px] font-bold flex-shrink-0 mt-0.5">3</span>
                    <div>
                      Copy the extracted folder (e.g.{' '}
                      <code className="text-[#a89858]">seed{currentSeed}\</code>
                      ) into the{' '}
                      <code className="text-[#a89858]">mods\</code>
                      {' '}folder.
                      <div className="mt-1 text-[#7a7858] italic">The folder name matches your seed number — this is normal.</div>
                    </div>
                  </div>
                </div>
                <div className="pt-1">
                  <p className="text-[#7a7858] mb-1.5">Choose a launch method:</p>
                  <div className="space-y-2">
                    <div className="flex items-start gap-2">
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full border border-[#c8942a] text-[#c8942a] text-[10px] font-bold flex-shrink-0 mt-0.5">4a</span>
                      <div>
                        <span className="text-[#c8942a] font-semibold">Easy</span>{' '}
                        <span className="text-[#4a7a4a] border border-[#4a7a4a] rounded px-1 text-[10px]">recommended</span>
                        <div className="mt-0.5">Double-click the included shortcut:</div>
                        <code className="block text-[#a89858] mt-0.5">D2R Randomizer {currentSeed}.lnk</code>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full border border-[#c8942a] text-[#c8942a] text-[10px] font-bold flex-shrink-0 mt-0.5">4b</span>
                      <div>
                        <span className="text-[#c8a870]">Manual</span> — In Battle.net, go to D2R → <em>Settings</em> → <em>Game Settings</em> → <em>Additional Command Line Arguments</em> and add:
                        <code className="block text-[#a89858] break-all mt-0.5">-mod seed{currentSeed} -txt -seed {currentSeed! >>> 0}</code>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="mt-2 rounded p-2 bg-[#0a2010]/60 border border-[#2a5a2a] text-[#6abf6a]">
                  ✓ If it worked, your new character&apos;s skill tree will show randomized skills.
                </div>
              </div>

              {/* Steam column */}
              <div className="space-y-2 border border-[#2a1508]/60 rounded p-3 bg-[#080203]/40">
                <p className="font-cinzel text-[11px] tracking-[0.22em] uppercase text-[#c8942a] mb-2">Steam</p>
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full border border-[#c8942a] text-[#c8942a] text-[10px] font-bold flex-shrink-0 mt-0.5">1</span>
                    <span>Extract the ZIP anywhere — your Desktop is fine.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full border border-[#c8942a] text-[#c8942a] text-[10px] font-bold flex-shrink-0 mt-0.5">2</span>
                    <div>
                      In your D2R install folder, open or create a{' '}
                      <code className="text-[#a89858]">mods/</code>
                      {' '}folder.
                      <div className="mt-1 text-[#7a7858]">Default location: <code className="text-[#7a7858] break-all">C:\Program Files (x86)\Steam\steamapps\common\Diablo II Resurrected\</code></div>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full border border-[#c8942a] text-[#c8942a] text-[10px] font-bold flex-shrink-0 mt-0.5">3</span>
                    <div>
                      Copy the extracted folder (e.g.{' '}
                      <code className="text-[#a89858]">seed{currentSeed}/</code>
                      ) into the{' '}
                      <code className="text-[#a89858]">mods/</code>
                      {' '}folder.
                      <div className="mt-1 text-[#7a7858] italic">The folder name matches your seed number — this is normal.</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full border border-[#c8942a] text-[#c8942a] text-[10px] font-bold flex-shrink-0 mt-0.5">4</span>
                    <div>
                      In Steam, right-click D2R → <em>Properties</em> → <em>General</em> → <em>Launch Options</em> and add:
                      <code className="block text-[#a89858] break-all mt-0.5">-mod seed{currentSeed} -txt -seed {currentSeed! >>> 0}</code>
                    </div>
                  </div>
                </div>
                <div className="mt-2 rounded p-2 bg-[#0a2010]/60 border border-[#2a5a2a] text-[#6abf6a]">
                  ✓ If it worked, your new character&apos;s skill tree will show randomized skills.
                </div>
                <div className="mt-1 rounded p-2 bg-[#080203]/60 border border-[#2a1508]/60 text-[#7a7858]">
                  <span className="text-[#c8a870] font-semibold">Game Pass?</span> Use the Microsoft Store install path instead. If you&apos;re unsure where D2R is installed, search <code className="text-[#a89858]">Diablo II Resurrected</code> in File Explorer.
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <ProgressIndicator status={status} message={errorMessage} />

      {preview && (
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
        {modCount !== null ? <>{modCount.toLocaleString()} mods generated &mdash; </> : null}v0.13: updated April 2026
      </p>
    </div>
  );
}
