import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import GenerateModes from '@/app/components/GenerateModes';
import { loadBuilderCatalog } from '@/lib/builder/catalog';

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
          the same skill tree shuffle, so you can share seeds with friends for a shared run. Or open
          the Class Builder to design your own class and let the rest randomize.
        </p>
      </div>

      {/* The Class Builder's skill catalog is rendered into this static page, so
          neither mode makes an API request on page view. */}
      <Suspense>
        <GenerateModes catalog={loadBuilderCatalog()} />
      </Suspense>

      {/* Server-rendered so the explanation is in the static HTML, outside the
          client-only generator. */}
      <section className="max-w-2xl mx-auto px-4 pt-6 pb-16 text-sm text-[#a89060]/90 leading-relaxed">
        <div className="flex items-center gap-3 mb-8">
          <div className="flex-1 h-px bg-gradient-to-r from-transparent to-[#7a5818]/60" />
          <span className="text-[#c8942a] text-xs">◆</span>
          <div className="flex-1 h-px bg-gradient-to-l from-transparent to-[#7a5818]/60" />
        </div>

        <h2 className="font-cinzel font-bold text-[#c8942a] text-lg tracking-[0.08em] mb-4">How the generator works</h2>
        <p className="mb-4">
          Each mod starts from the original Diablo II: Resurrected data tables. The generator uses your seed to
          give every class three skill tree layouts and a fresh set of skills drawn from all eight classes:
          Amazon, Sorceress, Necromancer, Paladin, Barbarian, Druid, Assassin and Warlock. Skills are placed
          by required level, so early skills stay near the top of the tree. Synergies are rewritten to point
          at skills you actually have, and prerequisites are rebuilt so every skill can be reached.
        </p>
        <p className="mb-4">
          The seed controls every random choice. Enter the same seed with the same options and you get the
          same mod, byte for byte, which is how friends and racers play identical runs. Leave the box empty
          for a random seed.
        </p>

        <h3 className="font-cinzel font-semibold text-[#e8c87a] tracking-[0.05em] mt-7 mb-2">Seed mode, Race Mode and the Class Builder</h3>
        <ul className="list-disc pl-5 space-y-2 mb-4">
          <li>
            <span className="text-[#e8c87a]">Seed mode</span>{' '}randomizes all eight classes. A spoiler preview
            shows each class&apos;s new trees before you download.
          </li>
          <li>
            <span className="text-[#e8c87a]">Race Mode</span>{' '}randomizes one class chosen by the seed, locks
            the map layout with a <code className="text-[#a89858]">-seed</code> launch option, and hides the
            spoiler, so every racer starts on equal terms.
          </li>
          <li>
            <span className="text-[#e8c87a]">Class Builder</span>{' '}lets you design one class by hand, choosing
            its tree layouts and every skill slot, while the other seven randomize from what you left out.
          </li>
        </ul>

        <h3 className="font-cinzel font-semibold text-[#e8c87a] tracking-[0.05em] mt-7 mb-2">Options</h3>
        <p className="mb-4">
          Optional settings let you shuffle ordinary monster families between acts, remove skill
          prerequisites, boost experience per difficulty, start with a Teleport staff or Horadric Cube, give
          every mercenary an aura, or hide the chat box. Hover or tap the ⓘ next to any option for details.
        </p>

        <h3 className="font-cinzel font-semibold text-[#e8c87a] tracking-[0.05em] mt-7 mb-2">After you download</h3>
        <p className="mb-6">
          The ZIP contains one mod folder and a launch shortcut. Copy the folder into the{' '}
          <code className="text-[#a89858]">mods</code> folder of your game install and launch with{' '}
          <code className="text-[#a89858]">-mod</code> and <code className="text-[#a89858]">-txt</code>. Mods
          are for offline play only; never use them with Battle.net online characters.
        </p>

        <ul className="flex flex-wrap gap-3 justify-center">
          {[
            { href: '/guide/install', label: 'Install guide' },
            { href: '/faq', label: 'FAQ' },
            { href: '/mutations', label: 'Mutations guide' },
            { href: '/multiplayer', label: 'Multiplayer' },
          ].map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                className="inline-block font-cinzel tracking-[0.15em] uppercase text-xs px-4 py-2 border border-[#c8942a]/40 text-[#c8942a] hover:bg-[#1a0a06] transition-colors"
              >
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
