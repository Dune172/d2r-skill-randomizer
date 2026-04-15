import type { Metadata } from 'next';
import Link from 'next/link';
import { CHANGELOG } from '@/lib/changelog/entries';

export const dynamic = 'force-static';

const description = 'Version history and patch notes for D2R Randomizer — free skill randomizer mod for Diablo 2 Resurrected.';

export const metadata: Metadata = {
  title: 'D2R Randomizer Patch Notes & Changelog',
  description,
  alternates: {
    canonical: '/changelog',
  },
  openGraph: {
    title: 'D2R Randomizer Patch Notes & Changelog',
    description,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'D2R Randomizer Patch Notes & Changelog',
    description,
  },
};

const changelog = CHANGELOG;

const changelogSchema = {
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  name: 'D2R Randomizer Changelog',
  description,
  url: 'https://d2rrandomizer.com/changelog',
  itemListElement: changelog.map(({ version, date, notes }, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    name: `D2R Randomizer ${version} — ${date}`,
    description: notes.join('. '),
  })),
};

export default function ChangelogPage() {
  return (
    <main className="min-h-screen">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(changelogSchema) }}
      />

      <section className="max-w-2xl mx-auto px-4 pt-12 pb-16">
        <h1 className="font-cinzel font-black tracking-[0.14em] text-3xl md:text-4xl text-[#c8942a] glow-gold uppercase mb-3">
          D2R Randomizer Changelog
        </h1>

        <div className="space-y-4 text-sm text-[#a89060]/80 leading-relaxed mb-10">
          <p>
            D2R Randomizer is actively developed. Each release adds new randomization options,
            fixes edge cases in skill tree generation, and improves the mod installation
            experience. This page tracks every version with a full list of changes.
          </p>
          <p>
            The randomizer shuffles all 8 class skill trees — Amazon, Sorceress, Necromancer,
            Paladin, Barbarian, Druid, Assassin, and Warlock — and recalculates synergies and
            prerequisites for every generated seed. Updates here may change what options are
            available on the{' '}
            <Link href="/generate" className="text-[#a87830] hover:text-[#c8942a] transition-colors">
              generator page
            </Link>
            {' '}or affect how existing seeds behave. Breaking changes are noted explicitly.
          </p>
        </div>

        <div className="space-y-10">
          {changelog.map(({ version, date, notes }) => (
            <div key={version}>
              <div className="flex items-baseline gap-4 mb-3">
                <h2 className="font-cinzel font-bold text-[#c8942a] text-lg tracking-[0.08em]">
                  {version}
                </h2>
                <span className="font-cinzel text-[10px] tracking-[0.3em] uppercase text-[#7a5818]">
                  {date}
                </span>
              </div>
              <ul className="space-y-1 border-l-2 border-[#3a1510] pl-4">
                {notes.map((note) => (
                  <li key={note} className="text-[#c8a84a]/80 text-sm leading-relaxed">
                    {note}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 pt-8 border-t border-[#1a0a06]">
          <Link
            href="/generate"
            className="font-cinzel tracking-[0.2em] uppercase text-sm px-6 py-3 bg-[#7a1f0a] hover:bg-[#9a2c0f] border border-[#c8942a]/40 text-[#e8c87a] transition-colors panel-shadow inline-block"
          >
            Generate a Mod
          </Link>
        </div>
      </section>
    </main>
  );
}
