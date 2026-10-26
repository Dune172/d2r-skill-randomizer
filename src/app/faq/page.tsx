import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import ContentPage, { contentMetadata } from '@/app/components/ContentPage';

export const revalidate = 3600;

export const metadata: Metadata = contentMetadata(
  '/faq',
  'D2R Randomizer FAQ',
  'Answers to common questions about D2R Randomizer: Battle.net safety, seeds, Race Mode, the Class Builder, mutations, monthly challenges, multiplayer and uninstalling.',
);

interface QA {
  q: string;
  /** Plain-text answer used for structured data. */
  text: string;
  /** Optional rich answer for the page; falls back to `text`. */
  body?: ReactNode;
}

const sections: { heading: string; items: QA[] }[] = [
  {
    heading: 'The basics',
    items: [
      {
        q: 'What is D2R Randomizer?',
        text: 'D2R Randomizer is a free fan-made mod generator for Diablo II: Resurrected. It shuffles the skill trees of all eight classes so a Sorceress might get Barbarian war cries, Amazon bow skills and Necromancer curses. Each download is a ready-to-install mod built from a seed number you choose.',
      },
      {
        q: 'Does it cost anything?',
        text: 'No. Generating and downloading mods is free and needs no account. The site is supported by optional Ko-fi donations and advertising.',
      },
      {
        q: 'Which version of the game do I need?',
        text: 'The PC version of Diablo II: Resurrected, from Battle.net, Steam or Game Pass. The Reign of the Warlock expansion is supported, so the Warlock is shuffled along with the seven original classes. Mods are built for the current game patch.',
      },
    ],
  },
  {
    heading: 'Safety',
    items: [
      {
        q: 'Is D2R Randomizer safe for my Battle.net account?',
        text: 'The mod only runs offline: single-player, or TCP/IP multiplayer with offline characters. It does not touch Battle.net servers, your online characters or your account. Never try to use a modded game or character online.',
      },
      {
        q: 'Does it change my game install?',
        text: 'No. The mod is a separate folder inside the game’s mods folder, and the game only loads it when you add the -mod launch option or use the included shortcut. Remove the launch option and the game is back to normal. Delete the folder to remove the mod entirely.',
      },
      {
        q: 'What is the .lnk file in the download?',
        text: 'It is a standard Windows shortcut that starts D2R.exe from the default Battle.net install folder with the mod’s launch options. It contains no program code. You can ignore it and enter the launch options yourself instead.',
      },
    ],
  },
  {
    heading: 'How the randomizer works',
    items: [
      {
        q: 'What exactly gets shuffled?',
        text: 'Every class receives three skill tree layouts and a new set of skills drawn from all eight classes. Skills are placed by their required level, so early skills sit in the top rows and late skills at the bottom. Synergies are rewritten so they point at skills that are actually in your trees, and prerequisites are reassigned by grid position so every skill can still be reached.',
      },
      {
        q: 'Do class-specific skills still work on other classes?',
        text: 'Most skills work anywhere. A few only function on their own class because of how the game engine handles them, such as Assassin claw skills or Barbarian Whirlwind. Those stay on their own class, and if one is left out of a tree a working stand-in skill takes its place, so no slot is dead.',
      },
      {
        q: 'How do seeds work?',
        text: 'A seed is a number that drives every random choice. The same seed with the same options always produces exactly the same mod, so you can share a seed or a generator link with friends and everyone gets identical skill trees. Leave the seed box empty to get a random seed.',
      },
      {
        q: 'What is Race Mode?',
        text: 'Race Mode is for competitive runs. It randomizes a single class chosen from the seed, so everyone racing that seed plays the same class, and it adds a -seed launch option that locks the map layout. It also hides the skill tree spoiler so the trees stay secret until you play. Race Mode characters are saved in their own folder, apart from your casual randomizer saves.',
      },
      {
        q: 'What is the Class Builder?',
        text: 'The Class Builder is the second tab on the Generate page. You pick one class, choose a layout for each of its three tabs from any of the 24 vanilla skill trees, and place any skill wherever you want it. The other seven classes are then randomized from the skills you left out. Each build has a short share link that recreates the exact same mod.',
      },
      {
        q: 'What other options are there?',
        text: 'The generator can also shuffle ordinary monster families between acts (with stats and rewards rebalanced for their new areas), remove skill prerequisites, boost experience per difficulty, start you with a Teleport staff or a Horadric Cube, give every mercenary a random aura, and hide the chat box. Each option has a short explanation next to it on the generator.',
      },
    ],
  },
  {
    heading: 'Challenges and leaderboards',
    items: [
      {
        q: 'What is the monthly Mutation Challenge?',
        text: 'On the first of each month a new challenge seed is posted with two or three mutations, rule changes such as faster monsters, halved life or no defense. Everyone plays the same seed and settings. Past challenges stay playable in the archive.',
        body: (
          <>
            On the first of each month a new <Link href="/challenge">challenge seed</Link> is posted with two
            or three mutations, rule changes such as faster monsters, halved life or no defense. Everyone plays
            the same seed and settings. Read what each one does in the{' '}
            <Link href="/mutations">mutations guide</Link>, and replay past challenges from the{' '}
            <Link href="/archive">archive</Link>.
          </>
        ),
      },
      {
        q: 'How do I get on the leaderboard?',
        text: 'Beat Baal on the challenge seed, then submit your run from the challenge page with your name, class, completion time and a video link as proof. Normal and Hell have separate leaderboards. Submissions are filtered for offensive names and can be removed by moderators.',
      },
    ],
  },
  {
    heading: 'Playing and troubleshooting',
    items: [
      {
        q: 'Can I play a seed with friends?',
        text: 'Yes, over TCP/IP using the free community tool D2RLoader. Everyone must use the same ZIP file, the same mod selection and the same versions. The multiplayer guide walks through the setup.',
        body: (
          <>
            Yes, over TCP/IP using the free community tool D2RLoader. Everyone must use the same ZIP file, the
            same mod selection and the same versions. The <Link href="/multiplayer">multiplayer guide</Link>{' '}
            walks through the setup.
          </>
        ),
      },
      {
        q: 'Can I use my existing characters?',
        text: 'Start a new character for each seed. An existing character’s skill points sit in specific tree slots, and on a randomized seed those slots hold different skills.',
      },
      {
        q: 'Does it work with other mods?',
        text: 'The game loads one mod at a time, so the randomizer replaces any other mod while it is selected. Merging it with large overhaul mods is not supported because both change the same skill files.',
      },
      {
        q: 'The skill trees look normal. What went wrong?',
        text: 'The game did not load the mod. Check that the folder name after -mod matches the folder in your mods directory exactly, that -txt is present, and that the folder is not nested inside a second folder of the same name.',
        body: (
          <>
            The game did not load the mod. Check that the folder name after <code>-mod</code> matches the
            folder in your <code>mods</code> directory exactly, that <code>-txt</code>{' '}is present, and that the
            folder isn&apos;t nested inside a second folder of the same name. The{' '}
            <Link href="/guide/install">install guide</Link> has more fixes.
          </>
        ),
      },
      {
        q: 'How do I uninstall?',
        text: 'Remove the -mod and -txt launch options, or launch the game normally instead of through the shortcut. To delete the mod completely, remove its folder from the mods directory.',
      },
      {
        q: 'How do I report a bug or suggest a feature?',
        text: 'Post in the D2R Randomizer Discord or email contact@d2rrandomizer.com. Include the seed, the options you used, and a screenshot if something looks wrong. Fixes are listed in the patch notes.',
        body: (
          <>
            Post in the{' '}
            <a href="https://discord.gg/y5r2sTxwS5" target="_blank" rel="noopener noreferrer">D2R Randomizer Discord</a>{' '}
            or use the <Link href="/contact">contact page</Link>. Include the seed, the options you used, and a
            screenshot if something looks wrong. Fixes are listed in the <Link href="/changelog">patch notes</Link>.
          </>
        ),
      },
    ],
  },
];

const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: sections.flatMap((s) =>
    s.items.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.text },
    })),
  ),
};

export default function FaqPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <ContentPage
        eyebrow="Help"
        title="Frequently Asked Questions"
        updated="2026-10-26"
        intro={
          <p>
            Short answers about safety, how the shuffle works, the monthly challenges and getting a mod
            running. For step-by-step setup, see the <Link href="/guide/install" className="text-[#c8942a] underline underline-offset-4">install guide</Link>.
          </p>
        }
        related={[
          { href: '/guide/install', label: 'Install guide' },
          { href: '/mutations', label: 'Mutations guide' },
          { href: '/generate', label: 'Generate a mod' },
        ]}
      >
        {sections.map((section) => (
          <section key={section.heading}>
            <h2>{section.heading}</h2>
            {section.items.map((item) => (
              <div key={item.q} className="border-l-2 border-[#3a1510] pl-4 mb-6">
                <h3 className="mt-0!">{item.q}</h3>
                <p className="mb-0! text-[#e8d5a0]/85">{item.body ?? item.text}</p>
              </div>
            ))}
          </section>
        ))}
      </ContentPage>
    </>
  );
}
