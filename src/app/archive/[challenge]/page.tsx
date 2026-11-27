import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import ContentPage, { contentMetadata } from '@/app/components/ContentPage';
import { ChallengeGenerator } from '@/app/challenge/ChallengeGenerator';
import { getActiveMutations, getWeekName } from '@/lib/mutations/registry';
import { MUTATION_TIPS } from '@/lib/mutations/tips';
import { formatWeekDate, getWeekEnd, getWeekSeed, getWeekStart } from '@/lib/challenge/week';
import { challengeRandomizesMonsters } from '@/lib/challenge/rules';
import { challengeEndDate, challengePath, challengeSlug, isPastChallenge, parseChallengeSlug, pastChallenges } from '@/lib/challenge/pages';
import { CHALLENGE_RECAPS } from '@/lib/challenge/recaps';
import { getEntries, stripIp, type PublicSubmission } from '@/lib/leaderboard';
import { challengePreview } from '@/lib/randomizer/preview';
import { CLASS_DEFS } from '@/lib/randomizer/config';
import { TREE_NAMES } from '@/lib/builder/catalog';
import { formatHMS } from '@/lib/time-format';

// Hourly, so late leaderboard changes (moderation, a corrected time) show up.
export const revalidate = 3600;

/** Every finished challenge at build time; later ones render on first request and then cache. */
export function generateStaticParams() {
  return pastChallenges().map((n) => ({ challenge: challengeSlug(n) }));
}

type Params = { params: Promise<{ challenge: string }> };

/** The challenge number for a slug, or null if it has no page (unknown, running or future). */
function resolve(slug: string): number | null {
  const n = parseChallengeSlug(slug);
  return n !== null && isPastChallenge(n) ? n : null;
}

const longDate = { month: 'long', day: 'numeric', year: 'numeric' } as const;

function joinList(items: string[]): string {
  if (items.length <= 2) return items.join(' and ');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function withArticle(word: string): string {
  return `${/^[aeiou]/i.test(word) ? 'an' : 'a'} ${word}`;
}

function describeChallenge(n: number): string {
  const names = getActiveMutations(n).map((m) => m.name);
  return `${getWeekName(n)} was D2R Randomizer Mutation Challenge ${n}: ${joinList(names)}. Mutations, results, the full skill layout and the seed to play it yourself.`;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const n = resolve((await params).challenge);
  if (n === null) return {};
  return contentMetadata(challengePath(n), `${getWeekName(n)}: D2R Mutation Challenge ${n}`, describeChallenge(n));
}

function resultsSummary(normal: PublicSubmission[], hell: PublicSubmission[]): string {
  if (normal.length === 0 && hell.length === 0) {
    return 'No runs were submitted to the leaderboard for this challenge, so the record is open: generate the mod below and set the first time.';
  }
  const parts: string[] = [];
  const [first, second] = normal;
  if (first) {
    const players = new Set(normal.map((e) => e.name)).size;
    const lead = players === 1
      ? `One player submitted a run: ${first.name}, who beat Baal on Normal as ${withArticle(first.className)} in ${formatHMS(first.timeSeconds)}.`
      : `${players} players submitted runs. ${first.name} won as ${withArticle(first.className)}, beating Baal on Normal in ${formatHMS(first.timeSeconds)}`;
    parts.push(
      players === 1 || !second
        ? lead
        : `${lead}, ${formatHMS(second.timeSeconds - first.timeSeconds)} ahead of ${second.name} (${second.className}).`,
    );
  }
  const [hellFirst] = hell;
  if (hellFirst) {
    parts.push(`${hellFirst.name} also took the challenge through Hell, finishing as ${withArticle(hellFirst.className)} in ${formatHMS(hellFirst.timeSeconds)}.`);
  }
  return parts.join(' ');
}

function ResultsTable({ entries, caption }: { entries: PublicSubmission[]; caption: string }) {
  return (
    <div className="overflow-x-auto mb-6">
      <table className="w-full text-left text-sm border-collapse">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="font-cinzel text-[10px] tracking-[0.25em] uppercase text-[#9a7a2a] border-b border-[#3a1510]">
            <th scope="col" className="py-2 pr-3 font-normal">Rank</th>
            <th scope="col" className="py-2 pr-3 font-normal">Player</th>
            <th scope="col" className="py-2 pr-3 font-normal">Class</th>
            <th scope="col" className="py-2 pr-3 font-normal">Time</th>
            <th scope="col" className="py-2 font-normal">Video</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e, i) => (
            <tr key={e.id} className="border-b border-[#1a0a06]">
              <td className="py-2 pr-3 text-[#c8942a]">{i + 1}</td>
              <td className="py-2 pr-3 text-[#e8d5a0]">{e.name}</td>
              <td className="py-2 pr-3">{e.className}</td>
              <td className="py-2 pr-3 font-mono">{formatHMS(e.timeSeconds)}</td>
              <td className="py-2">
                <a href={e.proofUrl} target="_blank" rel="nofollow ugc noopener noreferrer">
                  Watch<span className="sr-only"> {e.name}&apos;s run</span>
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const CLASS_CODE_BY_NAME = new Map(CLASS_DEFS.map((c) => [c.name, c.code]));
const CLASS_NAME_BY_CODE = new Map(CLASS_DEFS.map((c) => [c.code as string, c.name]));

/** The vanilla page whose grid shape a tree uses: "the Amazon's Javelin and Spear tree". */
function treeShape(sourceClass: string, sourceTree: number): string {
  const code = CLASS_CODE_BY_NAME.get(sourceClass);
  const name = code ? TREE_NAMES[`${code}-${sourceTree}`] : undefined;
  return name ? `the ${sourceClass}'s ${name} tree` : `${sourceClass} tree ${sourceTree}`;
}

function SkillLayout({ challenge }: { challenge: number }) {
  const preview = challengePreview(challenge);
  if ('mode' in preview) {
    return (
      <p>
        Forgotten Arts turned skill trees off for this challenge, so there is no layout to show. Every character
        learned magic from spell books and scrolls instead: early books from Akara, more found while exploring, and
        three matching copies cubed into a stronger one. The{' '}
        <Link href="/mutations#forgotten-arts">mutations guide</Link> covers how it works.
      </p>
    );
  }
  if (preview.masked) {
    return (
      <p>
        Mystery Box hides every skill&apos;s name and icon in the game, and this page keeps the secret too: the layout
        is only revealed by playing. Each class still has three full skill trees drawn from the shuffle, with the
        usual prerequisites. Generate the mod below and find out what you get.
      </p>
    );
  }
  return (
    <>
      <p>
        Every class&apos;s three skill trees for seed {preview.seed}. Skill Tree 1 is the leftmost tab in the game.
        Each tree borrows the grid shape of one vanilla tree and fills it with skills from any class, listed here
        from the top row down with the class each skill came from. This is the same layout you get by generating
        the mod today.
      </p>
      {preview.classes.map((cls) => (
        <section key={cls.code} aria-labelledby={`layout-${cls.code}`}>
          <h3 id={`layout-${cls.code}`}>{cls.name}</h3>
          <ul>
            {/* The game lays tabs out right to left; list them as the player sees them. */}
            {[...cls.tabs].reverse().map((tab, i) => {
              const skills = [...tab.skills].sort((a, b) => a.row - b.row || a.col - b.col);
              return (
                <li key={i}>
                  <strong>Skill Tree {i + 1}</strong>, shaped like {treeShape(tab.sourceClass, tab.sourceTree)}:{' '}
                  {skills
                    .map((s) => {
                      const from = CLASS_NAME_BY_CODE.get(s.originalClass);
                      return from ? `${s.name} (${from})` : s.name;
                    })
                    .join(', ')}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </>
  );
}

export default async function ChallengeArchivePage({ params }: Params) {
  const slug = (await params).challenge;
  const n = resolve(slug);
  if (n === null) notFound();
  if (slug !== challengeSlug(n)) permanentRedirect(challengePath(n));

  const name = getWeekName(n);
  const mutations = getActiveMutations(n);
  const seed = getWeekSeed(n);
  const start = getWeekStart(n);
  const end = getWeekEnd(n);
  const normal = getEntries(n).map(stripIp);
  const hell = getEntries(n, 'hell').map(stripIp);
  const recap = CHALLENGE_RECAPS[n] ?? [];
  const forgottenArts = mutations.some((m) => m.id === 'forgotten-arts');
  const monsters = challengeRandomizesMonsters(n);
  const newer = isPastChallenge(n + 1) ? n + 1 : null;
  const older = n > 1 ? n - 1 : null;

  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Challenge Archive', item: 'https://d2rrandomizer.com/archive' },
        { '@type': 'ListItem', position: 2, name: `Challenge ${n}: ${name}`, item: `https://d2rrandomizer.com${challengePath(n)}` },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Event',
      name: `D2R Randomizer Mutation Challenge ${n}: ${name}`,
      description: describeChallenge(n),
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      eventAttendanceMode: 'https://schema.org/OnlineEventAttendanceMode',
      location: { '@type': 'VirtualLocation', url: `https://d2rrandomizer.com${challengePath(n)}` },
      organizer: { '@type': 'Organization', name: 'D2R Randomizer', url: 'https://d2rrandomizer.com' },
    },
  ];

  return (
    <ContentPage
      eyebrow={`Challenge ${n} · ${formatWeekDate(start)} – ${formatWeekDate(end)}`}
      title={name}
      updated={challengeEndDate(n)}
      intro={
        <>
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
          <p className="mb-4">
            {name} was Mutation Challenge {n}, played from {formatWeekDate(start, longDate)} to{' '}
            {formatWeekDate(end, longDate)}. Everyone played the same D2R Randomizer seed, {seed}, with{' '}
            {mutations.length === 3 ? 'three' : 'two'} mutations: {joinList(mutations.map((m) => m.name))}.
          </p>
          <p>{resultsSummary(normal, hell)}</p>
        </>
      }
      related={[
        { href: '/archive', label: 'All past challenges' },
        { href: '/challenge', label: 'Current challenge' },
        { href: '/mutations', label: 'Mutations guide' },
      ]}
    >
      {recap.length > 0 && (
        <>
          <h2>Recap</h2>
          {recap.map((p) => <p key={p}>{p}</p>)}
        </>
      )}

      <h2>The mutations</h2>
      {mutations.map((m) => {
        const tips = MUTATION_TIPS[m.id] ?? [];
        return (
          <section key={m.id} aria-labelledby={`mutation-${m.id}`}>
            <h3 id={`mutation-${m.id}`}>{m.name}</h3>
            <div className="flex flex-col sm:flex-row gap-5 items-start mb-4">
              <Image
                src={`/mutations/${m.id}.webp`}
                alt=""
                width={96}
                height={96}
                className="shrink-0 border border-[#3a1510] bg-[#0c0304]"
              />
              <p className="text-[#e8d5a0] mb-0!">{m.description}</p>
            </div>
            {tips.length > 0 && (
              <ul>
                {tips.map((t) => <li key={t}>{t}</li>)}
              </ul>
            )}
            <p>
              <Link href={`/mutations#${m.id}`}>{m.name} in the mutations guide</Link>
            </p>
          </section>
        );
      })}

      <h2>Challenge settings</h2>
      <ul>
        <li>Seed {seed}, Reign of the Warlock, with all eight classes randomized. Pick any class you like.</li>
        <li>
          {forgottenArts
            ? 'Skills come from scrolls, books and equipment. You start with a Fire Bolt scroll and a Horadric Cube.'
            : 'Standard skill prerequisites. You start with a level 18 Teleport Staff, dropped by Corpsefire in the Den of Evil.'}
        </li>
        <li>1.5× experience in Acts I and II on Normal, and hirelings keep their auras.</li>
        <li>{monsters ? 'Monster shuffle is on: ordinary monster families trade places between acts, with stats and rewards rebalanced for their new areas.' : 'No monster shuffle: every area has its usual monsters.'}</li>
        <li>Offline single-player. The leaderboard ranks the fastest time to beat Baal, with a video as proof. Normal and Hell have separate boards.</li>
      </ul>

      <h2>Results</h2>
      {normal.length > 0 ? (
        <ResultsTable entries={normal} caption={`Normal difficulty leaderboard for challenge ${n}`} />
      ) : (
        <p>No Normal runs were submitted.</p>
      )}
      {hell.length > 0 && (
        <>
          <h3>Hell</h3>
          <ResultsTable entries={hell} caption={`Hell difficulty leaderboard for challenge ${n}`} />
        </>
      )}

      <h2>Skill layout</h2>
      <SkillLayout challenge={n} />

      <h2>Play this challenge</h2>
      <p>
        The challenge is finished, but the seed still works. Generating it gives you this challenge&apos;s seed, mutations
        and settings, built with the current version of the randomizer. You need Diablo II: Resurrected with Reign of the Warlock, and the{' '}
        <Link href="/guide/install">install guide</Link> walks through the rest.
      </p>
      <div className="not-prose my-8 text-center">
        <ChallengeGenerator seed={seed} weekNumber={n} weekOverride={n} />
      </div>

      <nav aria-label="Other challenges" className="flex justify-between gap-4 mt-10 text-xs">
        <span>{older && <Link href={challengePath(older)}>← Challenge {older}: {getWeekName(older)}</Link>}</span>
        <span className="text-right">{newer && <Link href={challengePath(newer)}>Challenge {newer}: {getWeekName(newer)} →</Link>}</span>
      </nav>
    </ContentPage>
  );
}
