import type { Metadata } from 'next';
import YamlBuilder from './YamlBuilder';
import { AP_MINIMUM_ARCHIPELAGO, AP_WORLD_VERSION } from '@/lib/archipelago/options';
import { AP_CONTRACT_VERSION } from '@/lib/randomizer/ap-mode';

// Nothing on this page is fetched: versions are baked in at build time, so a view never
// reaches the origin.
export const dynamic = 'force-static';

const title = 'D2R Randomizer for Archipelago';
const description = 'Play D2R Randomizer in an Archipelago multiworld: skill points become items found across everyone’s games.';

/**
 * UNLISTED until launch: absent from the nav and from sitemap.ts, disallowed in
 * robots.ts, and noindex here. Reachable only by typing the URL.
 */
export const metadata: Metadata = {
  title,
  description,
  robots: { index: false, follow: false, nocache: true },
};

const ARCHIPELAGO_URL = 'https://archipelago.gg/';
const ARCHIPELAGO_RELEASES = 'https://github.com/ArchipelagoMW/Archipelago/releases';

const code = 'text-[#a89858] break-all';
const extLink = 'text-[#c8942a] underline underline-offset-4 hover:text-[#e0ac4a] transition-colors';
const h2 = 'font-cinzel font-bold text-[#c8942a] text-lg tracking-[0.08em] mt-12 mb-5';

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

export default function ArchipelagoPage() {
  return (
    <main className="min-h-screen">
      <section className="max-w-2xl mx-auto px-4 pt-12">
        <h1 className="font-cinzel font-black tracking-[0.14em] text-3xl md:text-4xl text-[#c8942a] glow-gold uppercase mb-3">
          Archipelago
        </h1>
        <p className="font-cinzel text-sm text-[#a87830] tracking-[0.06em] mb-8">
          Your skill points, scattered across everyone&apos;s games
        </p>

        <div className="rounded border border-[#7a3a1a] bg-[#2a1008]/50 p-4 mb-8">
          <p className="font-cinzel text-[11px] tracking-[0.25em] uppercase text-[#d0a070] mb-2">
            Preview, not yet released
          </p>
          <p className="text-sm text-[#e8d5a0] leading-relaxed">
            Generating a multiworld and connecting to a room both work. Whether the game accepts the
            skill points the client hands over has not been confirmed in a real playthrough yet. Until
            it has, treat a run as a test rather than something to commit an evening to.
          </p>
        </div>

        <div className="space-y-4 text-sm text-[#e8d5a0]/90 leading-relaxed">
          <p>
            <a href={ARCHIPELAGO_URL} target="_blank" rel="noopener noreferrer" className={extLink}>Archipelago</a>{' '}
            links many games into one randomizer: the thing you need may be sitting in somebody else&apos;s
            game, and theirs in yours.
          </p>
          <p>
            In D2R Randomizer your tree is shuffled as usual, but levelling gives you no skill points.
            Each point is an item. Completing quests, activating waypoints, entering new areas and
            gaining levels are your checks, and every check sends an item to whoever it belongs to. When
            a point arrives for you, spend it anywhere in your tree.
          </p>
        </div>

        <h2 className={h2}>What you need</h2>
        <ul className="list-disc pl-5 space-y-2 text-sm text-[#e8d5a0]/90 leading-relaxed">
          <li>Diablo II: Resurrected, able to start an <span className="text-[#c8942a]">offline</span> character.</li>
          <li>
            <a href={ARCHIPELAGO_RELEASES} target="_blank" rel="noopener noreferrer" className={extLink}>Archipelago</a>{' '}
            {AP_MINIMUM_ARCHIPELAGO} or newer.
          </li>
          <li>
            The apworld:{' '}
            <a href="/archipelago/d2rr.apworld" download className={extLink}>d2rr.apworld</a>{' '}
            <span className="text-[#a89060]">(version {AP_WORLD_VERSION})</span>.
          </li>
          <li>
            The companion client, <code className={code}>d2rr-ap.exe</code>.{' '}
            <span className="text-[#a89060]">
              Not published yet: until release it is built from the repository with{' '}
              <code className={code}>npm run ap:build</code>.
            </span>
          </li>
        </ul>
        <p className="mt-3 text-xs text-[#a89060]">
          The apworld and the client must come from the same release. This site speaks mod contract{' '}
          {AP_CONTRACT_VERSION}; a client built for another one is told so when it asks for a mod.
        </p>

        <h2 className={h2}>Setup</h2>
        <ol className="space-y-8 text-sm text-[#e8d5a0]/90 leading-relaxed">
          <Step n={1} title="Install the apworld">
            <p>
              Double-click <code className={code}>d2rr.apworld</code>, or use <em>Install APWorld</em> in the
              Archipelago Launcher, then restart the Launcher.
            </p>
          </Step>
          <Step n={2} title="Make your options file">
            <p>
              Use the builder below and download the YAML. The person generating the multiworld needs
              one from every player.
            </p>
          </Step>
          <Step n={3} title="Start the client with the game closed">
            <p>Once the room is up, start the client with its address, port and your slot name:</p>
            <p><code className={code}>d2rr-ap.exe -host archipelago.gg -port 12345 -slot YourName -launch</code></p>
            <p>
              <code className={code}>-launch</code> downloads the mod made for your slot, installs it into
              the game&apos;s <code className={code}>mods</code> folder and starts the game with it.
            </p>
          </Step>
          <Step n={4} title="Create a new offline character">
            <p>
              Choose <span className="text-[#c8942a]">Offline</span> and create a character of the class in
              your options. It has to be a new character made under this mod.
            </p>
            <p className="rounded p-2 bg-[#0a2010]/60 border border-[#2a5a2a] text-[#6abf6a] text-xs">
              ✓ If it worked, the client prints the character&apos;s name and starts sending checks as you play.
            </p>
          </Step>
          <Step n={5} title="Play, and leave the client running">
            <p>
              Skill points arrive as unspent points in your tree. Type into the client window to talk to
              the room; <code className={code}>!hint Progressive Skill Point</code> and the other{' '}
              <code className={code}>!</code> commands work as in any Archipelago client.
            </p>
          </Step>
        </ol>
      </section>

      <section className="max-w-5xl mx-auto px-4 pb-4">
        <h2 className={`${h2} max-w-2xl mx-auto`}>Options builder</h2>
        <YamlBuilder />
      </section>

      <section className="max-w-2xl mx-auto px-4 pb-16">
        <h2 className={h2}>Good to know</h2>
        <ul className="list-disc pl-5 space-y-2 text-sm text-[#e8d5a0]/90 leading-relaxed">
          <li>
            <span className="text-[#c8942a]">Pick a short goal first.</span> Andariel on Normal is about
            an hour and shows you the whole loop.
          </li>
          <li>
            <span className="text-[#c8942a]">One slot, one character.</span> The client binds your slot
            to the first character it sees in the slot&apos;s save folder.
          </li>
          <li>
            <span className="text-[#c8942a]">After Normal,</span> start the client with{' '}
            <code className={code}>-difficulty 1</code> for Nightmare or <code className={code}>-difficulty 2</code>{' '}
            for Hell so area checks are filed under the right difficulty.
          </li>
          <li>
            <span className="text-[#c8942a]">Something not arriving?</span> The client says why about once
            a minute. <code className={code}>d2rr-ap.exe doctor</code> checks the installation and your
            character and changes nothing.
          </li>
        </ul>

        <p className="mt-10 text-xs text-[#a89060]/80 leading-relaxed">
          The mod is offline only, and the client refuses to touch the game while it is connected to
          Battle.net. D2R Randomizer is not affiliated with Archipelago or Blizzard Entertainment.
        </p>
      </section>
    </main>
  );
}
