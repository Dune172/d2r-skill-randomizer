'use client';

import { useEffect, useState } from 'react';

interface ProgressIndicatorProps {
  status: 'idle' | 'generating' | 'building' | 'ready' | 'error';
  message?: string;
}

const BUILDING_MESSAGES = [
  'Mutating monsters…',
  'Opening the gates of hell…',
  'Stoking the Hellforge…',
  'Rerolling the Horadric Cube…',
  'Consulting Deckard Cain…',
  'Imbuing chaos into item affixes…',
  'Summoning the Prime Evils…',
  'Rebalancing the cosmic loot table…',
  'Whispering with Mephisto…',
  'Counting Larzuk\u2019s sockets…',
  'Have you considered supporting Dune on Ko-fi?',
  'I wonder how Dune\u2019s Ko-fi is doing?',
  'If you\u2019re enjoying this, Dune\u2019s Ko-fi would love a visit.',
  'Fun fact: randomizers run on Ko-fi donations.',
  'Help support D2RR on Dune\u2019s Ko-fi.',
];

const SUPPORT_INDICES = new Set<number>([10, 11, 12, 13, 14]);

const STATUS_CONFIG = {
  generating: { text: 'Divining the threads of fate…', color: 'text-[#80b8e8]', spin: true },
  building:   { text: 'Forging the artifact…',         color: 'text-[#c8942a]', spin: true },
  ready:      { text: 'Your Randomizer is ready.',     color: 'text-[#50c058]', spin: false },
  error:      { text: '',                               color: 'text-[#c84040]', spin: false },
  idle:       { text: '',                               color: '',               spin: false },
};

export default function ProgressIndicator({ status, message }: ProgressIndicatorProps) {
  const [buildingIndex, setBuildingIndex] = useState(() =>
    Math.floor(Math.random() * BUILDING_MESSAGES.length)
  );

  useEffect(() => {
    if (status !== 'building') return;
    setBuildingIndex(Math.floor(Math.random() * BUILDING_MESSAGES.length));
    const id = setInterval(() => {
      setBuildingIndex((prev) => {
        if (BUILDING_MESSAGES.length <= 1) return prev;
        const prevIsSupport = SUPPORT_INDICES.has(prev);
        let next = prev;
        while (next === prev || (prevIsSupport && SUPPORT_INDICES.has(next))) {
          next = Math.floor(Math.random() * BUILDING_MESSAGES.length);
        }
        return next;
      });
    }, 3000);
    return () => clearInterval(id);
  }, [status]);

  if (status === 'idle') return null;

  const cfg = STATUS_CONFIG[status];
  const text = status === 'building' ? BUILDING_MESSAGES[buildingIndex] : cfg.text;

  return (
    <div className={`flex items-center gap-3 font-cinzel text-[11px] tracking-[0.18em] uppercase ${cfg.color}`}>
      {cfg.spin && (
        <svg className="animate-spin h-4 w-4 flex-shrink-0" viewBox="0 0 24 24">
          <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" />
          <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {!cfg.spin && status === 'ready' && <span>◆</span>}
      {!cfg.spin && status === 'error' && <span>✕</span>}
      <span>{status === 'error' ? (message || 'An error occurred') : text}</span>
    </div>
  );
}
