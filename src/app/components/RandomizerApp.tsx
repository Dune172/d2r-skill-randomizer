'use client';

import { useState } from 'react';
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
  startingItems: { teleportStaff: boolean; teleportStaffLevel: number; teleportStaffDropSource: string };
  hirelingAura: boolean;
  hirelingSkills: boolean;
  disableChat: boolean;
}

const defaultOptions: Options = {
  enablePrereqs: true,
  playersEnabled: false,
  playersCount: 1,
  playersActs: [1, 2, 3, 4, 5],
  startingItems: { teleportStaff: false, teleportStaffLevel: 1, teleportStaffDropSource: 'Corpsefire' },
  hirelingAura: true,
  hirelingSkills: true,
  disableChat: false,
};

function parseOptionsFromURL(): Options | null {
  if (typeof window === 'undefined') return null;
  const p = new URLSearchParams(window.location.search);
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
    },
    hirelingAura: p.get('hirelingAura') !== '0',
    hirelingSkills: p.get('hirelingSkills') !== '0',
    disableChat: p.get('disableChat') === '1',
  };
}

export default function RandomizerApp() {
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [currentSeed, setCurrentSeed] = useState<number | null>(null);
  const [currentOptions, setCurrentOptions] = useState<Options>(
    () => parseOptionsFromURL() ?? { ...defaultOptions }
  );
  const [seed, setSeed] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return new URLSearchParams(window.location.search).get('seed') ?? '';
  });

  const buildQueryParams = (seed: number, opts: Options = currentOptions) => {
    const playersParam = opts.playersEnabled && opts.playersCount > 1
      ? `&players=${opts.playersCount}`
      : '';
    const staffParam = opts.startingItems.teleportStaff
      ? `&teleportStaff=${opts.startingItems.teleportStaffLevel}&dropSource=${opts.startingItems.teleportStaffDropSource}`
      : '';
    const actsParam = opts.playersEnabled && opts.playersCount > 1
      ? `&acts=${[...opts.playersActs].sort((a, b) => a - b).join(',')}`
      : '';
    const noPrereqsParam  = !opts.enablePrereqs    ? '&noPrereqs=1'      : '';
    const hirelingAuraParam   = !opts.hirelingAura   ? '&hirelingAura=0'   : '';
    const hirelingSkillsParam = !opts.hirelingSkills ? '&hirelingSkills=0' : '';
    const disableChatParam    = opts.disableChat      ? '&disableChat=1'   : '';
    return `seed=${seed}${playersParam}${staffParam}${actsParam}&logic=normal${noPrereqsParam}${hirelingAuraParam}${hirelingSkillsParam}${disableChatParam}`;
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
        body: JSON.stringify({ seed: data.seed, enablePrereqs: options.enablePrereqs, logic: 'normal', playersEnabled: options.playersEnabled, playersCount: options.playersCount, playersActs: options.playersActs, startingItems: options.startingItems, hirelingAura: options.hirelingAura, hirelingSkills: options.hirelingSkills, disableChat: options.disableChat }),
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
    window.open(`/api/download?${buildQueryParams(currentSeed)}`, '_blank');
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      {/* ── Form panel ── */}
      <div className="rounded-lg border border-[#4a1e14] bg-[#0c0405]/80 p-6 panel-shadow">
        <RandomizerForm
          initialOptions={parseOptionsFromURL() ?? undefined}
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
              <div className="space-y-1.5 border border-[#2a1508]/60 rounded p-3 bg-[#080203]/40">
                <p className="font-cinzel text-[11px] tracking-[0.22em] uppercase text-[#c8942a] mb-2">Battle.net</p>
                <ol className="space-y-1 list-decimal list-inside">
                  <li>Extract the ZIP.</li>
                  <li>
                    Copy{' '}
                    <code className="text-[#a89858]">seed_{currentSeed}/</code>
                    {' '}to{' '}
                    <code className="text-[#7a7858]">[D2R folder]\mods\</code>
                  </li>
                  <li>
                    Use the included shortcut{' '}
                    <code className="text-[#a89858]">D2R Randomizer {currentSeed}.lnk</code>
                    {' '}— or add{' '}
                    <code className="text-[#a89858]">-mod seed_{currentSeed} -txt</code>
                    {' '}in your Battle.net launcher settings.
                  </li>
                </ol>
              </div>

              {/* Steam column */}
              <div className="space-y-1.5 border border-[#2a1508]/60 rounded p-3 bg-[#080203]/40">
                <p className="font-cinzel text-[11px] tracking-[0.22em] uppercase text-[#c8942a] mb-2">Steam</p>
                <ol className="space-y-1 list-decimal list-inside">
                  <li>Extract the ZIP.</li>
                  <li>
                    Copy{' '}
                    <code className="text-[#a89858]">seed_{currentSeed}/</code>
                    {' '}to the D2R mods folder inside your Steam install directory.
                  </li>
                  <li>
                    In Steam: right-click D2R → <em>Properties</em> → <em>General</em> → Launch Options, and add:{' '}
                    <code className="text-[#a89858]">-mod seed_{currentSeed} -txt</code>
                  </li>
                </ol>
              </div>
            </div>
          </div>
        )}
      </div>

      <ProgressIndicator status={status} message={errorMessage} />

      {preview && (
        <SkillTreePreview data={preview} />
      )}
    </div>
  );
}
