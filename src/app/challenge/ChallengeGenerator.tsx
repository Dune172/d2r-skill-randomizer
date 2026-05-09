'use client';

import { useState } from 'react';
import ProgressIndicator from '@/components/ProgressIndicator';

// Season Beta Race preset — same settings as the randomizer's season1race preset
export const SEASON1_OPTIONS = {
  enablePrereqs: true,
  playersEnabled: false,
  playersCount: 1,
  playersActs: [1, 2, 3, 4, 5],
  startingItems: {
    teleportStaff: true,
    teleportStaffLevel: 18,
    teleportStaffDropSource: 'Corpsefire',
    teleportStaffSpeed: false,
    horadricCube: false,
  },
  hirelingAura: true,
  disableChat: false,
  xpMultiplier: 1.5,
  xpActs: [1, 2],
};

type GenStatus = 'idle' | 'building' | 'ready' | 'error';

export function ChallengeGenerator({
  seed,
  weekNumber,
  weekOverride,
  onReady,
}: {
  seed: number;
  weekNumber: number;
  /** When set, instructs the API to apply the mutations from this past week instead of the current one. */
  weekOverride?: number;
  onReady?: () => void;
}) {
  const [status, setStatus] = useState<GenStatus>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const downloadUrl =
    `/api/download?seed=${seed}` +
    (SEASON1_OPTIONS.playersCount > 1 ? `&players=${SEASON1_OPTIONS.playersCount}&acts=${SEASON1_OPTIONS.playersActs.join(',')}` : '') +
    `&teleportStaff=${SEASON1_OPTIONS.startingItems.teleportStaffLevel}` +
    `&dropSource=${SEASON1_OPTIONS.startingItems.teleportStaffDropSource}` +
    (SEASON1_OPTIONS.startingItems.teleportStaffSpeed ? '' : '&staffSpeed=0') +
    (SEASON1_OPTIONS.startingItems.horadricCube ? '&cube=1' : '') +
    (SEASON1_OPTIONS.disableChat ? '&disableChat=1' : '') +
    `&xpMultiplier=${SEASON1_OPTIONS.xpMultiplier}` +
    `&xpActs=${SEASON1_OPTIONS.xpActs.join(',')}` +
    `&weekly=1` +
    `&week=${weekNumber}` +
    (weekOverride ? `&weekOverride=${weekOverride}` : '');

  const handleGenerate = async () => {
    setStatus('building');
    setErrorMsg('');
    const buildingStart = Date.now();

    try {
      const res = await fetch('/api/randomize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seed,
          ...SEASON1_OPTIONS,
          weeklyChallenge: weekOverride ? { enabled: true, weekOverride } : { enabled: true },
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Generation failed');
      }
      const elapsed = Date.now() - buildingStart;
      if (elapsed < 6000) await new Promise(r => setTimeout(r, 6000 - elapsed));
      setStatus('ready');
      onReady?.();
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  return (
    <div className="flex flex-col items-center gap-4">
      {status === 'ready' ? (
        <a
          href={downloadUrl}
          className="btn-shimmer inline-block font-cinzel tracking-[0.2em] uppercase text-sm px-8 py-3
            bg-gradient-to-b from-[#121838] to-[#0a1028]
            border border-[#283878] text-[#c8d8f8]
            hover:from-[#1a2448] hover:to-[#101830] hover:border-[#4858c0]
            transition-colors panel-shadow"
        >
          Download Zip
        </a>
      ) : (
        <button
          onClick={handleGenerate}
          disabled={status === 'building'}
          className="btn-shimmer inline-block font-cinzel tracking-[0.2em] uppercase text-sm px-8 py-3 bg-[#7a1f0a] hover:bg-[#9a2c0f] border border-[#c8942a]/40 text-[#e8c87a] transition-colors panel-shadow disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {status === 'building' ? 'Generating…' : status === 'error' ? 'Try Again' : 'Generate This Seed'}
        </button>
      )}
      {status !== 'ready' && (
        <p className="-mt-2 text-center text-[11px] text-[#8a7040] italic">
          Requires the Reign of the Warlock expansion.
        </p>
      )}
      <ProgressIndicator status={status} message={errorMsg} />
    </div>
  );
}
