import type { Metadata } from 'next';
import Link from 'next/link';
import ContentPage, { contentMetadata } from '@/app/components/ContentPage';

export const revalidate = 3600;

export const metadata: Metadata = contentMetadata(
  '/terms',
  'Terms of Use',
  'Terms of use for d2rrandomizer.com: offline-only use, no warranty, Blizzard trademark notice, leaderboard submission rules, advertising and contact.',
);

export default function TermsPage() {
  return (
    <ContentPage
      eyebrow="Legal"
      title="Terms of Use"
      updated="2026-10-26"
      intro={
        <p>
          These terms apply to d2rrandomizer.com and the mods it generates. By using the site or a generated
          mod, you agree to them. They are written to be read, so they are short.
        </p>
      }
      related={[
        { href: '/privacy', label: 'Privacy policy' },
        { href: '/contact', label: 'Contact' },
        { href: '/about', label: 'About' },
      ]}
    >
      <h2>1. What the site provides</h2>
      <p>
        D2R Randomizer is a free, independent fan project. The site generates modified game data for
        Diablo II: Resurrected based on the seed and options you choose. No account is needed, and there is
        no charge for generating or downloading mods.
      </p>

      <h2>2. You need your own copy of the game</h2>
      <p>
        A generated mod is not a game and does not contain one. It only works with a legitimately owned
        copy of Diablo II: Resurrected for PC. You are responsible for following the license terms of your
        copy of the game and the platform you bought it on.
      </p>

      <h2>3. Offline use only</h2>
      <p>
        Generated mods are intended for offline play: single-player, or TCP/IP multiplayer with offline
        characters. Do not use them, or characters created with them, on Battle.net online services. Doing
        so is outside the intended use of this project and is at your own risk.
      </p>

      <h2>4. Trademarks and affiliation</h2>
      <p>
        Diablo® II: Resurrected is a trademark of Blizzard Entertainment, Inc. D2R Randomizer is not
        affiliated with, endorsed, sponsored or approved by Blizzard Entertainment. Game names, terms and
        artwork referenced on this site belong to their respective owners and are used only to describe
        compatibility and to display the game&apos;s own content inside the mod. If you are a rights holder
        with a concern, please <Link href="/contact">contact us</Link>.
      </p>

      <h2>5. No warranty</h2>
      <p>
        The site and every generated mod are provided &ldquo;as is&rdquo;, without warranty of any kind.
        Randomized data can produce unusual combinations, and a seed may contain bugs. Back up your saved
        characters before installing mods. To the extent permitted by law, the project and its maintainer
        are not liable for lost progress, corrupted saves, or any other damage arising from use of the site
        or a generated mod.
      </p>

      <h2>6. Acceptable use</h2>
      <ul>
        <li>Don&apos;t attempt to overload, disrupt or bypass the site&apos;s rate limits or security.</li>
        <li>Don&apos;t use automated tools to generate mods in bulk.</li>
        <li>
          You may share seeds, generator links and downloaded mods with other players for free. Don&apos;t
          sell generated mods or present them as your own work.
        </li>
      </ul>

      <h2>7. Leaderboard submissions</h2>
      <p>
        When you submit a challenge run, your chosen name, class, time and video link are shown publicly.
        By submitting, you confirm that the run is yours, was played on the posted challenge seed and
        settings, and that the video link is genuine. Names must not be offensive or impersonate anyone.
        Submissions are filtered automatically and may be edited or removed by moderators at any time,
        for example if a run cannot be verified. See the <Link href="/privacy">privacy policy</Link> for how
        submission data is stored.
      </p>

      <h2>8. Links and advertising</h2>
      <p>
        The site links to third-party services such as Discord, Ko-fi, D2RLoader and video sites, and may
        show advertising from Google and its partners. Those services have their own terms and privacy
        policies, and we are not responsible for their content.
      </p>

      <h2>9. Changes</h2>
      <p>
        These terms may be updated as the project changes. The date at the top of this page shows when they
        last changed. Continued use of the site after an update means you accept the new terms.
      </p>

      <h2>10. Contact</h2>
      <p>
        Questions about these terms can be sent to{' '}
        <a href="mailto:contact@d2rrandomizer.com">contact@d2rrandomizer.com</a>.
      </p>
    </ContentPage>
  );
}
