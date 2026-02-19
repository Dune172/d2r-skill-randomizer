'use client';

import { useState } from 'react';

interface RandomizerFormProps {
  onGenerate: (seed: string, options: { enablePrereqs: boolean }) => void;
  isLoading: boolean;
}

export default function RandomizerForm({ onGenerate, isLoading }: RandomizerFormProps) {
  const [seed, setSeed] = useState('');
  const [enablePrereqs, setEnablePrereqs] = useState(true);

  const randomSeed = () => {
    const s = Math.floor(Math.random() * 2147483647).toString();
    setSeed(s);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (seed.trim()) {
      onGenerate(seed.trim(), { enablePrereqs });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label htmlFor="seed" className="block text-sm font-medium text-gray-300 mb-1">
            Seed
          </label>
          <div className="flex gap-2">
            <input
              id="seed"
              type="text"
              value={seed}
              onChange={e => setSeed(e.target.value)}
              placeholder="Enter a seed or number"
              className="flex-1 rounded-md bg-gray-800 border border-gray-600 px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
            />
            <button
              type="button"
              onClick={randomSeed}
              className="rounded-md bg-gray-700 px-3 py-2 text-sm text-gray-300 hover:bg-gray-600 transition-colors"
            >
              Random
            </button>
          </div>
        </div>
        <button
          type="submit"
          disabled={isLoading || !seed.trim()}
          className="rounded-md bg-amber-600 px-6 py-2 font-medium text-white hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isLoading ? 'Generating...' : 'Generate Preview'}
        </button>
      </div>
      <div className="flex items-center gap-2">
        <input
          id="enablePrereqs"
          type="checkbox"
          checked={enablePrereqs}
          onChange={e => setEnablePrereqs(e.target.checked)}
          className="h-4 w-4 rounded border-gray-600 bg-gray-800 text-amber-500 focus:ring-amber-500 focus:ring-offset-gray-900"
        />
        <label htmlFor="enablePrereqs" className="text-sm text-gray-300">
          Enable skill prerequisites (arrow connections on tree)
        </label>
      </div>
    </form>
  );
}
