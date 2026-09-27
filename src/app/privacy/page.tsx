import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How D2R Randomizer handles site usage, leaderboard submissions, and advertising data.',
  alternates: { canonical: '/privacy' },
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="font-cinzel text-balance text-3xl font-bold text-[#c8942a]">Privacy Policy</h1>
      <p className="mt-3 text-sm text-[#a89060]">Last updated: September 22, 2026</p>
      <div className="mt-8 space-y-8 text-pretty text-sm leading-relaxed text-[#e8d5a0] [&_h2]:mb-3 [&_h2]:text-balance [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-[#c8942a] [&_a]:underline [&_a]:underline-offset-4 [&_p+p]:mt-3">
        <section>
          <h2>About this site</h2>
          <p>D2R Randomizer is an independent fan project at d2rrandomizer.com. You can generate and download mods without creating an account. This policy describes information handled when you use the website.</p>
        </section>
        <section>
          <h2>Mod generation and site operation</h2>
          <p>We process the seed and options you submit to generate your mod. Seeds and options may appear in shareable URLs, and generated mods may be cached for reuse. Do not include personal information in seed names or shared links.</p>
          <p>The website uses IP addresses to limit excessive requests and protect availability. Hosting and content delivery providers may process IP addresses, request details, and browser information to deliver and secure the site. Their operational logs are separate from our aggregate traffic statistics.</p>
        </section>
        <section>
          <h2>Traffic statistics and browser storage</h2>
          <p>Our own traffic counter records daily totals by landing page, referral website, and campaign source. It stores aggregate counts rather than individual browsing histories, IP addresses, or browser identifiers. These daily statistics are kept for up to 366 days.</p>
          <p>We use session storage in your browser to avoid counting the same visit repeatedly and to recover from page loading errors. This storage is separate from advertising cookies.</p>
        </section>
        <section>
          <h2>Challenge leaderboards</h2>
          <p>If you submit a run, your chosen name, class, completion time, proof link, and submission details may be displayed publicly. We also store the submission IP address for moderation; it is not included in the public leaderboard response. Avoid submitting personal information you do not want displayed.</p>
        </section>
        <section>
          <h2>Advertising</h2>
          <p>We may display Google AdSense ads to support the website. When advertising is enabled, Google and other advertising partners may place or read cookies, use web beacons, and process IP addresses, browser or device information, and ad interactions to deliver ads, measure their performance, and prevent fraud.</p>
          <p>Third-party vendors, including Google, may use advertising cookies to serve ads based on earlier visits to this site or other websites. These cookies allow Google and its partners to personalize advertising where permitted and according to your consent choices.</p>
          <p>Learn more about <a href="https://policies.google.com/technologies/partner-sites">how Google uses information from partner sites</a> and <a href="https://policies.google.com/privacy">Google’s Privacy Policy</a>. Advertising partners and their purposes are also described in the consent message where it is shown.</p>
        </section>
        <section>
          <h2>Your advertising choices</h2>
          <p>When ads are enabled, visitors in the European Economic Area, the United Kingdom, and Switzerland are shown a consent message through Google’s consent platform. You can revisit your decision using the “Privacy and cookie settings” link supplied at the bottom of the page where applicable. Where US state privacy messages apply, use the “Do not sell or share my personal information” link supplied by the consent platform.</p>
          <p>You can also manage personalized Google ads in <a href="https://myadcenter.google.com/">My Ad Center</a> and opt out of participating companies’ personalized advertising through <a href="https://optout.aboutads.info/">YourAdChoices</a>. These settings may not remove all ads. Your browser settings let you manage or delete cookies and other site storage.</p>
        </section>
        <section>
          <h2>External services and questions</h2>
          <p>Links to Discord, Ko-fi, and proof-hosting sites take you to services with their own privacy policies. Payments made through Ko-fi are processed by Ko-fi and its payment providers; this website does not collect payment card details.</p>
          <p>For privacy questions or to request removal of a leaderboard entry, contact the project maintainer through the <a href="https://discord.gg/y5r2sTxwS5">D2R Randomizer Discord</a>. Do not post sensitive personal information in public channels.</p>
          <p>We will update this page as the website’s data practices change.</p>
        </section>
      </div>
    </main>
  );
}
