import type { Metadata } from 'next';
import Link from 'next/link';
import ContentPage, { contentMetadata } from '@/app/components/ContentPage';
import { CHANGELOG } from '@/lib/changelog/entries';

export const revalidate = 3600;

export const metadata: Metadata = contentMetadata(
  '/about',
  'About D2R Randomizer',
  'Who makes D2R Randomizer, why it exists, how the skill tree shuffle works, and how the free Diablo 2 Resurrected mod generator is funded.',
);

export default function AboutPage() {
  const releases = CHANGELOG.length;
  const latest = CHANGELOG[0];

  return (
    <ContentPage
      eyebrow="About"
      title="About D2R Randomizer"
      updated="2026-10-26"
      intro={
        <p>
          D2R Randomizer is a free, independent fan project that turns Diablo II: Resurrected into a new game
          every time you play. It generates mods that shuffle the skill trees of all eight classes, so the
          class you know by heart plays like something you have never seen.
        </p>
      }
      related={[
        { href: '/generate', label: 'Generate a mod' },
        { href: '/changelog', label: 'Patch notes' },
        { href: '/contact', label: 'Contact' },
      ]}
    >
      <h2>Why it exists</h2>
      <p>
        Diablo II has been played for over two decades, and most players know the optimal build for every
        class. Randomizers are a long tradition in speedrunning and retro gaming communities because they
        make a familiar game unpredictable again. D2R Randomizer brings that idea to Diablo II: Resurrected
        without asking players to edit data files by hand: pick a seed, click generate, and install a
        ready-made mod.
      </p>
      <p>
        The project started as a skill shuffler and has grown into a full toolkit: monthly Mutation
        Challenges with public leaderboards, a Class Builder for designing your own class, monster
        shuffling, multiplayer support through D2RLoader, and dozens of quality-of-life options.
      </p>

      <h2>Who makes it</h2>
      <p>
        D2R Randomizer is designed, built and maintained by <strong>Dune</strong>, with feedback and
        testing from the community on{' '}
        <a href="https://discord.gg/y5r2sTxwS5" target="_blank" rel="noopener noreferrer">Discord</a>. Bug
        reports, challenge results and suggestions from players shape almost every release.
      </p>

      <h2>How it works</h2>
      <p>
        Diablo II: Resurrected can load mods: folders of plain-text data tables that replace the game&apos;s
        own. When you generate a mod, the site reads the original skill, monster and item tables, applies
        your seed and options, and writes new tables plus matching skill tree artwork into a ZIP file.
      </p>
      <ul>
        <li>
          <strong>Seeded shuffle.</strong> A seed number drives every random choice, so the same seed and
          options always produce an identical mod. That&apos;s what makes seeds shareable and challenges fair.
        </li>
        <li>
          <strong>Skills placed by level.</strong> Each class gets three tree layouts, and skills are placed
          by their required level so early skills appear early and late skills stay late.
        </li>
        <li>
          <strong>Synergies and prerequisites rewritten.</strong> Synergy bonuses are re-pointed at skills
          that are actually in your trees, and prerequisite arrows are rebuilt so every skill can be
          reached.
        </li>
        <li>
          <strong>Engine-aware substitutions.</strong> A few skills only work on their original class
          because of how the game engine handles them. Those stay home, and a working stand-in fills the
          slot elsewhere, so you never get a dead skill.
        </li>
      </ul>
      <p>
        The randomizer is updated regularly: the patch notes list {releases} releases so far, the latest
        being {latest.version} ({latest.date}). Each one records what changed and why, in the{' '}
        <Link href="/changelog">patch notes</Link>.
      </p>

      <h2>Offline only, and not affiliated with Blizzard</h2>
      <p>
        Mods run offline: single-player, or TCP/IP multiplayer with offline characters. They never connect
        to Battle.net and should never be used with online characters.
      </p>
      <p>
        Diablo® II: Resurrected is a trademark of Blizzard Entertainment, Inc. D2R Randomizer is an
        independent fan project and is not affiliated with, endorsed, sponsored or approved by Blizzard
        Entertainment. You need your own copy of the game to use a mod. See the{' '}
        <Link href="/terms">terms of use</Link> for details.
      </p>

      <h2>How the site is funded</h2>
      <p>
        Generating and downloading mods is free, with no account required. Hosting and development are
        paid for by voluntary donations on{' '}
        <a href="https://ko-fi.com/d2rrando" target="_blank" rel="noopener noreferrer">Ko-fi</a> and by
        advertising. Ads are kept away from the generator controls and download buttons. How advertising
        data is handled is explained in the <Link href="/privacy">privacy policy</Link>.
      </p>

      <h2>Get in touch</h2>
      <p>
        Questions, bug reports and press or creator requests are welcome. Email{' '}
        <a href="mailto:contact@d2rrandomizer.com">contact@d2rrandomizer.com</a> or see the{' '}
        <Link href="/contact">contact page</Link> for other ways to reach us.
      </p>
    </ContentPage>
  );
}
