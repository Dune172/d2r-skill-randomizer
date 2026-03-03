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
  playersActs: number[];
  startingItems: { teleportStaff: boolean; teleportStaffLevel: number };
  hirelingAura: boolean;
  hirelingSkills: boolean;
}

interface InstallResult {
  success: boolean;
  modName?: string;
  error?: string;
}

export default function Home() {
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [currentSeed, setCurrentSeed] = useState<number | null>(null);
  const [currentOptions, setCurrentOptions] = useState<Options>({ enablePrereqs: true, logic: 'normal', playersEnabled: false, playersCount: 1, playersActs: [1, 2, 3, 4, 5], startingItems: { teleportStaff: false, teleportStaffLevel: 1 }, hirelingAura: true, hirelingSkills: true });
  const [installResult, setInstallResult] = useState<InstallResult | null>(null);
  // Seed state owned here so we can update the textbox after generation
  const [seed, setSeed] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return new URLSearchParams(window.location.search).get('seed') ?? '';
  });

  const buildQueryParams = (seed: number) => {
    const playersParam = currentOptions.playersEnabled && currentOptions.playersCount > 1
      ? `&players=${currentOptions.playersCount}`
      : '';
    const staffParam = currentOptions.startingItems.teleportStaff
      ? `&teleportStaff=${currentOptions.startingItems.teleportStaffLevel}`
      : '';
    const actsParam = currentOptions.playersEnabled && currentOptions.playersCount > 1
      ? `&acts=${[...currentOptions.playersActs].sort((a, b) => a - b).join(',')}`
      : '';
    const hirelingAuraParam   = !currentOptions.hirelingAura   ? '&hirelingAura=0'   : '';
    const hirelingSkillsParam = !currentOptions.hirelingSkills ? '&hirelingSkills=0' : '';
    return `seed=${seed}${playersParam}${staffParam}${actsParam}&logic=${currentOptions.logic}${hirelingAuraParam}${hirelingSkillsParam}`;
  };

  const handleGenerate = async (seedInput: string, options: Options) => {
    setCurrentOptions(options);
    setStatus('generating');
    setErrorMessage('');
    setPreview(null);
    setInstallResult(null);

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
        body: JSON.stringify({ seed: data.seed, enablePrereqs: options.enablePrereqs, logic: options.logic, playersEnabled: options.playersEnabled, playersCount: options.playersCount, playersActs: options.playersActs, startingItems: options.startingItems, hirelingAura: options.hirelingAura, hirelingSkills: options.hirelingSkills }),
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

  const handleInstall = async () => {
    if (currentSeed === null) return;
    setInstallResult(null);

    if (!('showDirectoryPicker' in window)) {
      alert('Browser-based install requires Chrome or Edge. Use "Download Zip" instead.');
      return;
    }

    try {
      // 1. Fetch file data from server
      const res = await fetch(`/api/install-files?${buildQueryParams(currentSeed)}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to fetch mod files');
      }
      const { modName, files } = await res.json();

      // 2. Ask user to pick their D2R directory
      const dirHandle = await (window as any).showDirectoryPicker({
        id: 'd2r-install',
        mode: 'readwrite',
        startIn: 'downloads',
      });

      // 3. Verify it's actually the D2R folder
      try { await dirHandle.getFileHandle('D2R.exe'); }
      catch { throw new Error('D2R.exe not found in selected folder. Please select the Diablo II Resurrected installation folder.'); }

      // 4. Create mods/modName/ directory tree
      const modsHandle = await dirHandle.getDirectoryHandle('mods', { create: true });
      const modHandle  = await modsHandle.getDirectoryHandle(modName, { create: true });

      // 5. Write each file (creating subdirectory structure as needed)
      for (const file of files) {
        const parts = file.path.split('/');
        let currentDir = modHandle;
        for (const part of parts.slice(0, -1)) {
          currentDir = await currentDir.getDirectoryHandle(part, { create: true });
        }
        const fileHandle = await currentDir.getFileHandle(parts[parts.length - 1], { create: true });
        const writable   = await fileHandle.createWritable();
        const bytes      = Uint8Array.from(atob(file.content), c => c.charCodeAt(0));
        await writable.write(bytes);
        await writable.close();
      }

      // 6. Success
      setInstallResult({ success: true, modName });

    } catch (err: any) {
      if (err.name === 'AbortError') return; // user cancelled picker
      setInstallResult({ success: false, error: err.message });
    }
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
              href="https://ko-fi.com/dune172"
              target="_blank"
              rel="noopener noreferrer"
              className="font-cinzel text-[11px] tracking-[0.45em] text-[#a87830] hover:text-[#c8942a] transition-colors uppercase"
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
            <div className="pt-3 space-y-2">
              <button
                onClick={handleInstall}
                className="w-full rounded py-3
                  font-cinzel font-bold tracking-[0.22em] text-sm uppercase text-[#c8d8f8]
                  bg-gradient-to-b from-[#0e1f4a] to-[#081230]
                  border border-[#1e3878]
                  hover:from-[#162848] hover:to-[#0e1a3a] hover:border-[#3858c0]
                  transition-all duration-200
                  shadow-[0_0_16px_rgba(30,56,120,0.30)] hover:shadow-[0_0_28px_rgba(56,88,192,0.42)]"
              >
                Install to D2R
              </button>
              <button
                onClick={handleDownload}
                className="w-full rounded py-2.5
                  font-cinzel font-bold tracking-[0.22em] text-sm uppercase text-[#8898b8]
                  bg-gradient-to-b from-[#0d0f18] to-[#080a10]
                  border border-[#1e2438]
                  hover:from-[#121520] hover:to-[#0a0c15] hover:border-[#2a3050] hover:text-[#a8b8d8]
                  transition-all duration-200"
              >
                Download Zip
              </button>

              <p className="text-[11px] text-[#6a4828] pt-1">
                <span className="text-[#8898b8]">Install to D2R</span> — opens a folder picker; select your Diablo II Resurrected folder.
                Works instantly for Steam installs on user-writable drives.
                For Battle.net installs in Program Files, use <span className="text-[#8898b8]">Download Zip</span> and
                copy the mod folder to <code className="text-[#7a7858]">[D2R dir]\mods\</code> manually.
              </p>

              {installResult && (
                <div className={`mt-2 rounded p-3 border text-sm ${
                  installResult.success
                    ? 'bg-[#0a1a0a] border-[#1a4a1a] text-[#80c880]'
                    : 'bg-[#1a0a0a] border-[#4a1a1a] text-[#c88080]'
                }`}>
                  {installResult.success ? (
                    <>
                      <p className="font-bold mb-1">Mod installed!</p>
                      <p className="text-[#60a860]">
                        Launch command: <code className="text-[#a0d8a0]">D2R.exe -mod {installResult.modName} -txt</code>
                      </p>
                      <p className="text-[11px] text-[#4a7a4a] mt-1">
                        Or add those arguments in the Battle.net launcher settings.
                      </p>
                    </>
                  ) : (
                    <p>{installResult.error}</p>
                  )}
                </div>
              )}
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
