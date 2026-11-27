import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import ContentPage, { contentMetadata } from '@/app/components/ContentPage';
import { MUTATIONS, getMutationIds, getWeekName } from '@/lib/mutations/registry';
import { getCurrentWeekNumber } from '@/lib/challenge/week';
import { MUTATION_TIPS } from '@/lib/mutations/tips';
import { challengePath } from '@/lib/challenge/pages';

// Hourly so the "featured in" lists pick up a new month's challenge.
export const revalidate = 3600;

export const metadata: Metadata = contentMetadata(
  '/mutations',
  'D2R Randomizer Mutations Guide',
  'Every D2R Randomizer mutation explained: what each rule change does in Diablo 2 Resurrected, strategy tips, and which monthly challenges featured it.',
);

export default function MutationsPage() {
  const current = getCurrentWeekNumber();

  // Challenge numbers each mutation appeared in, up to and including the live one.
  const featured = new Map<number, number[]>();
  for (let c = 1; c <= current; c++) {
    for (const id of getMutationIds(c)) {
      featured.set(id, [...(featured.get(id) ?? []), c]);
    }
  }

  // Only mutations that have already been revealed in a challenge.
  const entries = Object.entries(MUTATIONS)
    .map(([key, def]) => ({ key: Number(key), def }))
    .filter(({ key }) => featured.has(key))
    .sort((a, b) => a.def.name.localeCompare(b.def.name));

  return (
    <ContentPage
      eyebrow="Guide"
      title="Mutations Guide"
      updated="2026-10-26"
      intro={
        <>
          <p className="mb-4">
            Mutations are rule changes layered on top of a randomized seed. Some make monsters faster or
            tougher, some change how you gear up, and some hide your skills entirely. Each monthly{' '}
            <Link href="/challenge" className="text-[#c8942a] underline underline-offset-4">Mutation Challenge</Link>{' '}
            combines two or three of them, and everyone plays the same seed and settings.
          </p>
          <p>
            This guide covers all {entries.length} mutations that have appeared so far: what each one does,
            how to play around it, and which challenges used it. Past challenges can be replayed from the{' '}
            <Link href="/archive" className="text-[#c8942a] underline underline-offset-4">archive</Link>.
          </p>
        </>
      }
      related={[
        { href: '/challenge', label: 'Current challenge' },
        { href: '/archive', label: 'Challenge archive' },
        { href: '/faq', label: 'FAQ' },
      ]}
    >
      <nav aria-label="Mutations" className="mb-10">
        <ul className="list-none! pl-0! grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-xs">
          {entries.map(({ def }) => (
            <li key={def.id}>
              <a href={`#${def.id}`}>{def.name}</a>
            </li>
          ))}
        </ul>
      </nav>

      <h2>How mutations work</h2>
      <p>
        A mutation edits the game&apos;s data files when your mod is generated, exactly like the skill
        shuffle. Nothing runs in the background while you play. Mutations that would cancel each other out,
        such as Molasses and Hyperdrive, are never paired in the same challenge. Challenge mods also turn off
        Race Mode, so every class is randomized and you can pick whichever one you like.
      </p>
      <p>
        Most mutations push you toward a particular style: area damage against The Horde, kiting against
        Molasses, resistances against Pestilence. Reading the active mutations before you choose a class
        is the easiest way to make a challenge run go smoothly.
      </p>

      {entries.map(({ key, def }) => {
        const challenges = featured.get(key) ?? [];
        const tips = MUTATION_TIPS[def.id] ?? [];
        return (
          <section key={def.id} id={def.id} className="scroll-mt-24 border-t border-[#1a0a06] pt-2 mt-10">
            <h2 className="mt-6!">{def.name}</h2>
            <div className="flex flex-col sm:flex-row gap-5 items-start">
              <Image
                src={`/mutations/${def.id}.webp`}
                alt=""
                width={112}
                height={112}
                className="shrink-0 border border-[#3a1510] bg-[#0c0304]"
              />
              <div className="min-w-0">
                <p className="text-[#e8d5a0]">{def.description}</p>
              </div>
            </div>
            {tips.length > 0 && (
              <>
                <h3>Strategy</h3>
                <ul>
                  {tips.map((t) => <li key={t}>{t}</li>)}
                </ul>
              </>
            )}
            <p className="text-xs text-[#a89060]">
              Featured in:{' '}
              {challenges.map((c, i) => (
                <span key={c}>
                  {i > 0 && ', '}
                  {c === current ? (
                    <Link href="/challenge">{getWeekName(c)} (#{c}) — live now</Link>
                  ) : (
                    <Link href={challengePath(c)}>{getWeekName(c)} (#{c})</Link>
                  )}
                </span>
              ))}
            </p>
          </section>
        );
      })}
    </ContentPage>
  );
}
