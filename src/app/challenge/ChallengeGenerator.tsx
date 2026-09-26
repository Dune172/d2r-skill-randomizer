'use client';

import { useState } from 'react';
import ProgressIndicator from '@/components/ProgressIndicator';
import { generateMod } from '@/lib/generate-mod';
import { challengeRandomizesMonsters } from '@/lib/challenge/rules';
import { getActiveMutations } from '@/lib/mutations/registry';

import { SEASON1_OPTIONS } from '@/lib/challenge/options';
export { SEASON1_OPTIONS } from '@/lib/challenge/options';

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
  const forgottenArts = getActiveMutations(challengeWeek).some(m => m.id === 'forgotten-arts');

  const downloadUrl =
    `/api/download?seed=${seed}` +
    (SEASON1_OPTIONS.playersCount > 1 ? `&players=${SEASON1_OPTIONS.playersCount}&acts=${SEASON1_OPTIONS.playersActs.join(',')}` : '') +
    `&teleportStaff=${forgottenArts ? 0 : SEASON1_OPTIONS.startingItems.teleportStaffLevel}` +
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
        startingItems: { ...SEASON1_OPTIONS.startingItems, teleportStaff: !forgottenArts },
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
      {forgottenArts && <p className="text-center text-xs text-[#c8a870]">Start a new character with a Fire Bolt scroll and Cube. Skills come from scrolls, books and equipment.</p>}
      <ProgressIndicator status={status} message={errorMsg} />
    </div>
  );
}
