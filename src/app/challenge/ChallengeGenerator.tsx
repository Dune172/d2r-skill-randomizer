'use client';

import { useState } from 'react';
import ProgressIndicator from '@/components/ProgressIndicator';
import { generateMod } from '@/lib/generate-mod';
import { challengeRandomizesMonsters } from '@/lib/challenge/rules';

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
  xpDifficulties: [1],
  // The weekly challenge is full randomization, not race mode. This must match
  // the `&raceMode=0` in downloadUrl below — otherwise /api/randomize caches the
  // ZIP under raceMode=true while /api/download looks it up under raceMode=false,
  // producing a cache miss (404 "Zip not found") when the download link is followed.
  raceMode: false,
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
  const challengeWeek = weekOverride ?? weekNumber;

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
    `&xpDifficulties=${SEASON1_OPTIONS.xpDifficulties.join(',')}` +
    `&weekly=1` +
    `&week=${weekNumber}` +
    `&weekOverride=${challengeWeek}` +
    `&raceMode=0`;

  const handleGenerate = async () => {
    setStatus('building');
    setErrorMsg('');
    const buildingStart = Date.now();

    try {
      await generateMod(JSON.stringify({
        seed,
        ...SEASON1_OPTIONS,
        weeklyChallenge: { enabled: true, weekOverride: challengeWeek },
      }), setErrorMsg);
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
      {challengeRandomizesMonsters(challengeWeek) && (
        <p className="text-center text-xs text-[#c8a870]">
          Monster randomization is enabled for this challenge, with stats balanced for each area.
        </p>
      )}
      <ProgressIndicator status={status} message={errorMsg} />
    </div>
  );
}
