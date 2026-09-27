import type { Metadata } from 'next';
import Link from 'next/link';

export const dynamic = 'force-static';

const title = 'Play D2R Randomizer Multiplayer with D2RLoader';
const description = 'Set up D2RLoader to play a D2R Randomizer seed with friends over TCP/IP in Diablo 2 Resurrected.';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/multiplayer' },
  openGraph: { title, description },
  twitter: { card: 'summary_large_image', title, description },
};

const LOADER_URL = 'https://d2rloader.net/';
const LOADER_DOWNLOAD_URL = 'https://d2rloader.net/download.html';
const LOADER_TCP_URL = 'https://d2rloader.net/tcp-ip.html';

const code = 'text-[#a89858] break-all';
const extLink = 'text-[#c8942a] underline underline-offset-4 hover:text-[#e0ac4a] transition-colors';

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full border border-[#c8942a] text-[#c8942a] text-xs font-bold flex-shrink-0 mt-0.5">
        {n}
      </span>
      <div className="min-w-0 space-y-2">
        <h3 className="font-cinzel text-[#c8942a] tracking-[0.06em] font-semibold">{title}</h3>
        {children}
      </div>
    </li>
  );
}

export default function MultiplayerPage() {
  return (
    <main className="min-h-screen">
      <section className="max-w-2xl mx-auto px-4 pt-12 pb-16">
        <h1 className="font-cinzel font-black tracking-[0.14em] text-3xl md:text-4xl text-[#c8942a] glow-gold uppercase mb-3">
          Multiplayer
        </h1>
        <p className="font-cinzel text-sm text-[#a87830] tracking-[0.06em] mb-8">
          Play a randomized seed with friends using D2RLoader
        </p>

        <div className="space-y-4 text-sm text-[#e8d5a0]/90 leading-relaxed mb-8">
          <p>
            Diablo II: Resurrected removed TCP/IP games, so mods normally run single-player only.{' '}
            <a href={LOADER_URL} target="_blank" rel="noopener noreferrer" className={extLink}>D2RLoader</a>{' '}
            is a free community tool that restores TCP/IP multiplayer on your regular Battle.net or Steam
            install, including Reign of the Warlock. D2R Randomizer mods load in it like any other mod,
            so you and your friends can run the same shuffled skill trees together.
          </p>
          <p className="text-[#a89060]/80 text-xs">
            D2RLoader is made by a separate community team. It is not affiliated with D2R Randomizer or
            Blizzard Entertainment. For D2RLoader bugs, use the Discord linked on their site.
          </p>
        </div>

        {/* The one rule that breaks most sessions */}
        <div className="rounded border border-[#c8942a]/60 bg-[#2a1508]/50 p-4 mb-10">
          <p className="font-cinzel text-[11px] tracking-[0.25em] uppercase text-[#c8942a] mb-2">
            Everything must match
          </p>
          <p className="text-sm text-[#e8d5a0] leading-relaxed mb-2">
            Multiplayer only works when every player has an identical setup. D2RLoader checks this
            before letting anyone join, and a mismatch will stop the join.
          </p>
          <ul className="list-disc pl-5 space-y-1 text-sm text-[#e8d5a0]/90">
            <li><span className="text-[#c8942a]">Same seed</span>, generated with the same options, ideally the exact same ZIP file.</li>
            <li><span className="text-[#c8942a]">Same mods</span>: the same mod selected in D2RLoader, with no extra changes to its files.</li>
            <li><span className="text-[#c8942a]">Same plugins</span>: identical D2RLoader plugins and extensions, or none at all.</li>
            <li><span className="text-[#c8942a]">Same versions</span> of D2RLoader and Diablo II: Resurrected.</li>
          </ul>
          <p className="text-xs text-[#a89060] mt-3">
            Easiest way to guarantee this: the host generates the mod once and sends the ZIP to everyone.
          </p>
        </div>

        <h2 className="font-cinzel font-bold text-[#c8942a] text-lg tracking-[0.08em] mb-5">Setup</h2>
        <ol className="space-y-8 text-sm text-[#e8d5a0]/90 leading-relaxed">
          <Step n={1} title="Install D2RLoader (everyone)">
            <p>
              Download the latest release from the{' '}
              <a href={LOADER_DOWNLOAD_URL} target="_blank" rel="noopener noreferrer" className={extLink}>D2RLoader download page</a>{' '}
              and extract the ZIP into your Diablo II: Resurrected install folder.
            </p>
            <div className="text-xs text-[#a89060] space-y-1">
              <p>Battle.net default: <code className={code}>C:\Program Files (x86)\Diablo II Resurrected\</code></p>
              <p>Steam default: <code className={code}>C:\Program Files (x86)\Steam\steamapps\common\Diablo II Resurrected\</code></p>
            </div>
          </Step>

          <Step n={2} title="Install the same randomizer mod (everyone)">
            <p>
              The host{' '}
              <Link href="/generate" className={extLink}>generates a seed</Link>{' '}
              and shares the ZIP. Everyone extracts it and copies the seed folder (for example{' '}
              <code className={code}>seed12345\</code>) into the <code className={code}>mods\</code> folder
              inside the D2R install folder. Create <code className={code}>mods\</code>{' '}if it doesn&apos;t exist.
            </p>
            <p className="text-xs text-[#a89060]">
              Sharing a generator link instead of the ZIP also works, as long as everyone downloads from it
              on the same day with no option changed. Seasonal content and challenges rotate over time.
            </p>
          </Step>

          <Step n={3} title="Launch through D2RLoader and pick the mod">
            <p>
              Start <code className={code}>D2RLoader.exe</code>{' '}instead of launching the game from Battle.net
              or Steam. In D2RLoader&apos;s options, select your seed folder as the mod (it lists every folder
              in <code className={code}>mods\</code>) and restart when prompted.
            </p>
            <p>
              In the same options, go to <em>General</em> and turn on <em>Show TCP/IP Button</em>.
            </p>
            <p className="rounded p-2 bg-[#0a2010]/60 border border-[#2a5a2a] text-[#6abf6a] text-xs">
              ✓ If it worked, a new character&apos;s skill tree shows randomized skills.
            </p>
          </Step>

          <Step n={4} title="Host a game">
            <p>
              Select an <span className="text-[#c8942a]">offline</span> character, then click{' '}
              <em>Multiplayer</em> next to Play and open <em>Host Game</em>. Choose:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li><em>Public</em>: listed in D2RLoader&apos;s game browser.</li>
              <li><em>Unlisted</em>: hidden. Share the Game ID with your friends.</li>
              <li><em>LAN Only</em>: same local network, or a virtual LAN such as Tailscale or ZeroTier.</li>
            </ul>
            <p className="text-xs text-[#a89060]">
              Hosting uses TCP port 4000. D2RLoader tries to set this up automatically, but some routers need
              the port forwarded manually. See the{' '}
              <a href={LOADER_TCP_URL} target="_blank" rel="noopener noreferrer" className={extLink}>D2RLoader TCP/IP guide</a>.
            </p>
          </Step>

          <Step n={5} title="Join a game">
            <p>
              Friends select an offline character, click <em>Multiplayer</em>, and either find the game
              under <em>Browse Games</em> or use <em>Direct Join</em>{' '}with the host&apos;s Game ID.
            </p>
          </Step>
        </ol>

        <h2 className="font-cinzel font-bold text-[#c8942a] text-lg tracking-[0.08em] mt-12 mb-4">Tips for co-op seeds</h2>
        <ul className="list-disc pl-5 space-y-2 text-sm text-[#e8d5a0]/90 leading-relaxed">
          <li>
            <span className="text-[#c8942a]">Keep chat enabled.</span>{' '}The &ldquo;Disable chat&rdquo; option
            removes the chat box, which you&apos;ll want for coordinating.
          </li>
          <li>
            <span className="text-[#c8942a]">Everyone plays in the host&apos;s world.</span>{' '}Maps come from the
            host&apos;s game, so joining players don&apos;t need a map seed of their own.
          </li>
          <li>
            <span className="text-[#c8942a]">Back up your characters.</span> D2RLoader has a built-in backup
            manager. Use it before switching mods or plugins.
          </li>
        </ul>

        <h2 className="font-cinzel font-bold text-[#c8942a] text-lg tracking-[0.08em] mt-12 mb-4">Can&apos;t join?</h2>
        <ul className="list-disc pl-5 space-y-2 text-sm text-[#e8d5a0]/90 leading-relaxed">
          <li>Almost always a mismatch. Re-copy the host&apos;s ZIP into everyone&apos;s <code className={code}>mods\</code> folder, replacing the old seed folder.</li>
          <li>Check that everyone has the same seed selected in D2RLoader, and the same plugins (or none).</li>
          <li>Update D2RLoader and the game so all players are on the same versions.</li>
          <li>If the game never appears, the host&apos;s port 4000 may be blocked. Try <em>LAN Only</em>{' '}over a virtual LAN.</li>
        </ul>

        <p className="mt-10 text-xs text-[#a89060]/80 leading-relaxed">
          Never use D2R Randomizer or D2RLoader with Battle.net online characters. Multiplayer here is TCP/IP
          with offline characters only.
        </p>

        <div className="mt-10 pt-8 border-t border-[#1a0a06] flex flex-wrap justify-center gap-4">
          <Link
            href="/generate"
            className="font-cinzel tracking-[0.2em] uppercase text-sm px-6 py-3 bg-[#7a1f0a] hover:bg-[#9a2c0f] border border-[#c8942a]/40 text-[#e8c87a] transition-colors panel-shadow inline-block"
          >
            Generate a Mod
          </Link>
          <a
            href={LOADER_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-cinzel tracking-[0.2em] uppercase text-sm px-6 py-3 border border-[#c8942a]/40 text-[#c8942a] hover:bg-[#1a0a06] transition-colors inline-block"
          >
            Get D2RLoader
          </a>
        </div>
      </section>
    </main>
  );
}
