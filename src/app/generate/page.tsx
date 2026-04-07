import type { Metadata } from 'next';
import RandomizerApp from '@/app/components/RandomizerApp';

const howToSchema = {
  '@context': 'https://schema.org',
  '@type': 'HowTo',
  name: 'How to Install a D2R Randomizer Mod',
  description: 'Generate and install a randomized skill tree mod for Diablo 2 Resurrected.',
  step: [
    {
      '@type': 'HowToStep',
      position: 1,
      name: 'Generate your mod',
      text: 'Enter any seed number on this page (or leave it blank for a random one) and click Generate. The server will build your personalized mod ZIP.',
    },
    {
      '@type': 'HowToStep',
      position: 2,
      name: 'Download and extract the ZIP',
      text: 'Click Download when generation is complete. Extract the ZIP contents into your Diablo II Resurrected mods folder: C:\\Users\\[You]\\Saved Games\\Diablo II Resurrected\\mods\\',
    },
    {
      '@type': 'HowToStep',
      position: 3,
      name: 'Launch with the mod flag',
      text: 'Add -mod d2rrandomizer -txt to your D2R shortcut or Battle.net launch options. Start the game in offline mode and your randomized skill trees will be active.',
    },
  ],
};

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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(howToSchema) }}
      />

      <div className="max-w-3xl mx-auto px-4 pt-10 pb-2 text-center">
        <h1 className="font-cinzel font-black tracking-[0.14em] text-3xl md:text-4xl text-[#c8942a] glow-gold uppercase mb-3">
          Generate a D2R Randomizer Mod
        </h1>
        <p className="text-[#a89060]/80 text-sm leading-relaxed max-w-xl mx-auto">
          Enter any seed number — or leave it blank for a random one. The same seed always produces
          the same skill tree shuffle, so you can share seeds with friends for a shared run.
        </p>
      </div>

      <RandomizerApp />

      {/* How to Install */}
      <section className="max-w-3xl mx-auto px-4 pt-6 pb-16">
        <div className="flex items-center gap-3 mb-8">
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[#7a5818] to-[#c8942a]" />
          <span className="text-[#c8942a] text-xs">◆</span>
          <div className="flex-1 h-px bg-gradient-to-l from-transparent via-[#7a5818] to-[#c8942a]" />
        </div>

        <h2 className="font-cinzel font-bold text-[#c8942a] tracking-[0.1em] uppercase text-lg mb-6">
          How to Install Your D2R Randomizer Mod
        </h2>

        <ol className="space-y-5">
          {howToSchema.step.map((step) => (
            <li key={step.position} className="flex gap-4">
              <span className="font-cinzel font-black text-[#c8942a] text-lg leading-none mt-0.5 shrink-0 w-5">
                {step.position}
              </span>
              <div>
                <p className="font-semibold text-[#e8d5a0] text-sm mb-1">{step.name}</p>
                <p className="text-[#a89060]/80 text-sm leading-relaxed">{step.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
