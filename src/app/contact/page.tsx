import type { Metadata } from 'next';
import Link from 'next/link';
import ContentPage, { contentMetadata } from '@/app/components/ContentPage';

export const revalidate = 3600;

export const metadata: Metadata = contentMetadata(
  '/contact',
  'Contact D2R Randomizer',
  'How to reach the D2R Randomizer team: email, Discord, bug reports, leaderboard and privacy requests, and press or creator inquiries.',
);

const EMAIL = 'contact@d2rrandomizer.com';

export default function ContactPage() {
  return (
    <ContentPage
      eyebrow="Contact"
      title="Contact"
      updated="2026-10-26"
      intro={
        <p>
          D2R Randomizer is run by one developer, Dune, with help from the community. The fastest way to get
          help is usually the Discord. For anything private, use email.
        </p>
      }
      related={[
        { href: '/faq', label: 'FAQ' },
        { href: '/guide/install', label: 'Install guide' },
        { href: '/about', label: 'About' },
      ]}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
        <div className="border border-[#3a1510] bg-[#0c0304] panel-shadow p-5">
          <p className="font-cinzel text-[10px] tracking-[0.35em] uppercase text-[#8a7040] mb-2">Email</p>
          <p className="mb-2!">
            <a href={`mailto:${EMAIL}`} className="text-base">{EMAIL}</a>
          </p>
          <p className="mb-0! text-xs text-[#a89060]">Privacy requests, leaderboard removals, press and partnerships.</p>
        </div>
        <div className="border border-[#3a1510] bg-[#0c0304] panel-shadow p-5">
          <p className="font-cinzel text-[10px] tracking-[0.35em] uppercase text-[#8a7040] mb-2">Discord</p>
          <p className="mb-2!">
            <a href="https://discord.gg/y5r2sTxwS5" target="_blank" rel="noopener noreferrer" className="text-base">
              D2R Randomizer Discord
            </a>
          </p>
          <p className="mb-0! text-xs text-[#a89060]">Install help, bug reports, run sharing and challenge chat.</p>
        </div>
      </div>

      <h2>Before you write</h2>
      <p>
        Many setup problems are answered in the <Link href="/guide/install">install guide</Link> and the{' '}
        <Link href="/faq">FAQ</Link>. If the skill trees look normal after installing, the mod usually
        isn&apos;t loading because of a folder name or launch option mismatch.
      </p>

      <h2>Reporting a bug</h2>
      <p>To help us reproduce the problem, include:</p>
      <ul>
        <li>The seed number, or the full generator link, and any options you changed.</li>
        <li>Whether you play through Battle.net, Steam or Game Pass, and whether you use D2RLoader.</li>
        <li>What you expected to happen and what happened instead, with a screenshot if possible.</li>
        <li>For crashes, the skill or area involved and what you were doing at the time.</li>
      </ul>
      <p>
        Fixed bugs are listed in the <Link href="/changelog">patch notes</Link>.
      </p>

      <h2>Leaderboards and privacy</h2>
      <p>
        To correct or remove a leaderboard entry you submitted, email us with the challenge, the name you
        used and the proof link. For questions about data the site handles, see the{' '}
        <Link href="/privacy">privacy policy</Link>. Please don&apos;t post personal information in public
        Discord channels.
      </p>

      <h2>Press and creators</h2>
      <p>
        Streamers, video creators and writers are welcome to feature D2R Randomizer and the monthly
        challenges. Email us if you&apos;d like background on how the randomizer works or want to plan a
        feature.
      </p>

      <h2>Response times</h2>
      <p>
        This is a volunteer project, so replies can take a few days. Privacy requests and reports of broken
        downloads get priority.
      </p>
    </ContentPage>
  );
}
