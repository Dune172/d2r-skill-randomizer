'use client';

import { useState } from 'react';
import RandomizerForm from '@/components/RandomizerForm';
import SkillTreePreview from '@/components/SkillTreePreview';
import ProgressIndicator from '@/components/ProgressIndicator';

type Status = 'idle' | 'generating' | 'building' | 'ready' | 'error';

interface Options {
  enablePrereqs: boolean;
}

export default function Home() {
  const [preview, setPreview] = useState<any>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [currentSeed, setCurrentSeed] = useState<number | null>(null);
  const [currentOptions, setCurrentOptions] = useState<Options>({ enablePrereqs: true });

  const handleGenerate = async (seedInput: string, options: Options) => {
    setCurrentOptions(options);
    setStatus('generating');
    setErrorMessage('');
    setPreview(null);

    try {
      const res = await fetch('/api/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seed: seedInput }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Preview failed');
      }

      const data = await res.json();
      setPreview(data);
      setCurrentSeed(data.seed);
      setStatus('idle');
    } catch (err) {
      setStatus('error');
      setErrorMessage(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  const handleBuildMod = async () => {
    if (!currentSeed && currentSeed !== 0) return;
    setStatus('building');
    setErrorMessage('');

    try {
      const res = await fetch('/api/randomize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seed: currentSeed, enablePrereqs: currentOptions.enablePrereqs }),
      });

      if (!res.ok) {
        const err = await res.json();
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
    window.open(`/api/download?seed=${currentSeed}`, '_blank');
  };

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-amber-400 mb-2">
            D2R Skill Tree Randomizer
          </h1>
          <p className="text-gray-400">
            Reign of the Warlock - Randomize skill trees across all classes
          </p>
        </div>

        <div className="space-y-6">
          <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-6">
            <RandomizerForm
              onGenerate={handleGenerate}
              isLoading={status === 'generating'}
            />
          </div>

          <ProgressIndicator status={status} message={errorMessage} />

          {preview && (
            <>
              <div className="flex gap-3">
                <button
                  onClick={handleBuildMod}
                  disabled={status === 'building'}
                  className="rounded-md bg-emerald-600 px-6 py-2 font-medium text-white hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {status === 'building' ? 'Building...' : 'Build Mod'}
                </button>
                {status === 'ready' && (
                  <button
                    onClick={handleDownload}
                    className="rounded-md bg-blue-600 px-6 py-2 font-medium text-white hover:bg-blue-500 transition-colors"
                  >
                    Download Zip
                  </button>
                )}
              </div>

              <SkillTreePreview data={preview} />
            </>
          )}
        </div>
      </div>
    </main>
  );
}
