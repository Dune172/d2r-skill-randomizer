import type { Metadata } from 'next';
import { Suspense } from 'react';
import RandomizerApp from '@/app/components/RandomizerApp';

export const dynamic = 'force-static';


export const metadata: Metadata = {
  title: 'Generate Your D2R Randomizer Mod',
  description:
    'Enter a seed to generate a free D2R Randomizer mod for Diablo 2 Resurrected. Download your randomized skill tree mod in seconds.',
  alternates: {
    canonical: '/generate',
  },
  openGraph: {
    title: 'Generate Your D2R Randomizer Mod',
    description: 'Enter a seed to generate a free D2R Randomizer mod for Diablo 2 Resurrected. Download your randomized skill tree mod in seconds.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Generate Your D2R Randomizer Mod',
    description: 'Enter a seed to generate a free D2R Randomizer mod for Diablo 2 Resurrected. Download your randomized skill tree mod in seconds.',
  },
};

export default function GeneratePage() {
  return (
    <main className="min-h-screen">
      <div className="max-w-3xl mx-auto px-4 pt-10 pb-2 text-center">
        <h1 className="font-cinzel font-black tracking-[0.14em] text-3xl md:text-4xl text-[#c8942a] glow-gold uppercase mb-3">
          Generate a D2R Randomizer Mod
        </h1>
        <p className="text-[#a89060]/80 text-sm leading-relaxed max-w-xl mx-auto">
          Enter any seed number — or leave it blank for a random one. The same seed always produces
          the same skill tree shuffle, so you can share seeds with friends for a shared run.
        </p>
      </div>

      <Suspense>
        <RandomizerApp />
      </Suspense>
    </main>
  );
}
