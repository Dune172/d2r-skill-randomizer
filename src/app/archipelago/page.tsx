import fs from 'fs';
import path from 'path';
import type { Metadata } from 'next';
import PlayerFile from './PlayerFile';
import { AP_MINIMUM_ARCHIPELAGO, AP_WORLD_VERSION } from '@/lib/archipelago/options';
import { AP_CONTRACT_VERSION } from '@/lib/randomizer/ap-mode';

// Nothing on this page is fetched: versions and the app's size are read at build time,
// so a view never reaches the origin.
export const dynamic = 'force-static';

const title = 'D2R Randomizer for Archipelago';
const description = 'Play D2R Randomizer in an Archipelago multiworld: skill points become items found across everyone’s games.';

/**
 * UNLISTED until launch: absent from the nav and from sitemap.ts, disallowed in
 * robots.ts, and noindex here. Reachable only by typing or sharing the URL, which is how
 * testers get it.
 */
export const metadata: Metadata = {
  title,
  description,
  robots: { index: false, follow: false, nocache: true },
};

const ARCHIPELAGO_URL = 'https://archipelago.gg/';
const ARCHIPELAGO_RELEASES = 'https://github.com/ArchipelagoMW/Archipelago/releases';
const ARCHIPELAGO_UPLOADS = 'https://archipelago.gg/uploads';

/** Committed by scripts/publish-ap-client.mjs; its size is shown on the download button. */
const APP_FILE = '/archipelago/d2rr-ap.exe';
function appSizeMb(): string | null {
  try {
    return (fs.statSync(path.join(process.cwd(), 'public', APP_FILE)).size / 1048576).toFixed(0);
  } catch {
    return null;
  }
}

const code = 'text-[#a89858] break-all';
const extLink = 'text-[#c8942a] underline underline-offset-4 hover:text-[#e0ac4a] transition-colors';
const sectionLabel = 'font-cinzel text-[11px] tracking-[0.22em] uppercase text-[#c8942a]';
const h2 = 'font-cinzel font-bold text-[#c8942a] text-lg tracking-[0.08em] mt-12 mb-5';

function StepHeading({ n, title, note }: { n: number; title: string; note?: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full border border-[#c8942a] text-[#c8942a] text-xs font-bold flex-shrink-0">
        {n}
      </span>
      <h2 className="font-cinzel font-bold text-[#c8942a] tracking-[0.08em]">{title}</h2>
      {note && <span className="text-xs text-[#a89060]">{note}</span>}
    </div>
  );
}

function MiniStep({ n, children }: { n: number | string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full border border-[#c8942a] text-[#c8942a] text-[10px] font-bold flex-shrink-0 mt-0.5">
        {n}
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function Divider() {
  return (
    <div className="flex items-center gap-3 my-6" aria-hidden="true">
      <div className="flex-1 h-px bg-gradient-to-r from-transparent to-[#4a1e14]" />
      <span className="text-[#c8942a] text-xs">◆</span>
      <div className="flex-1 h-px bg-gradient-to-l from-transparent to-[#4a1e14]" />
    </div>
  );
}

export default function ArchipelagoPage() {
  const size = appSizeMb();
  return (
    <main className="min-h-screen">
      <section className="max-w-3xl mx-auto px-4 pt-12 pb-6 text-center">
        <p className="inline-block rounded-full border border-[#7a3a1a] bg-[#2a1008]/60 px-3 py-0.5 mb-4 font-cinzel text-[10px] tracking-[0.25em] uppercase text-[#d0a070]">
          Tester preview
        </p>
        <h1 className="font-cinzel font-black tracking-[0.14em] text-3xl md:text-4xl text-[#c8942a] glow-gold uppercase mb-3">
          Archipelago
        </h1>
        <p className="text-sm text-[#e8d5a0]/90 leading-relaxed max-w-xl mx-auto">
          Play D2R Randomizer in an{' '}
          <a href={ARCHIPELAGO_URL} target="_blank" rel="noopener noreferrer" className={extLink}>Archipelago</a>{' '}
          multiworld. Your tree is shuffled as usual, but your skill points are items scattered across
          everyone&apos;s games: quests, waypoints, new areas and levels send items to the others, and
          theirs send points to you.
        </p>
      </section>

      <section className="max-w-3xl mx-auto px-4">
        <div className="rounded-lg border border-[#4a1e14] bg-[#0c0405]/80 p-4 md:p-6 panel-shadow">
          <StepHeading n={1} title="Make your player file" />
          <PlayerFile />

          <Divider />

          <StepHeading n={2} title="Get the app" note="Windows, once" />
          <p className="text-sm text-[#e8d5a0]/90 leading-relaxed mb-4">
            The app connects your offline character to the room, sets up this game&apos;s mod for you and
            hands over the skill points other players find.
          </p>
          {size ? (
            <a
              href={APP_FILE} download
              className="block w-full rounded py-3 text-center
                font-cinzel font-bold tracking-[0.22em] text-sm uppercase text-[#c8d8f8]
                bg-gradient-to-b from-[#121838] to-[#0a1028]
                border border-[#283878]
                hover:from-[#1a2448] hover:to-[#101830] hover:border-[#4858c0]
                transition-all duration-200
                shadow-[0_0_16px_rgba(40,56,120,0.30)] hover:shadow-[0_0_28px_rgba(72,88,192,0.42)]"
            >
              Download the app <span className="normal-case tracking-normal font-normal text-[#8898c8]">(d2rr-ap.exe, {size} MB)</span>
            </a>
          ) : (
            <p className="rounded border border-[#5c1818] bg-[#1a0606]/60 p-3 text-sm text-[#e8a0a0]">
              The app is not on this build of the site yet.
            </p>
          )}
          <div className="mt-3 rounded border border-[#2a1508]/60 bg-[#080203]/40 p-3 text-xs text-[#c8a870] leading-relaxed space-y-1.5">
            <p>
              <span className="text-[#c8942a]">&ldquo;Windows protected your PC&rdquo;?</span> The app is new and not
              code-signed, so Windows doesn&apos;t recognise it yet. Click <em>More info</em>, then <em>Run anyway</em>.
            </p>
            <p>
              It reads and changes Diablo II&apos;s memory to deliver your points, which some antivirus
              programs dislike. It only works offline and never touches a Battle.net game.
            </p>
          </div>

          <Divider />

          <StepHeading n={3} title="Connect and play" />
          <div className="space-y-3 text-sm text-[#e8d5a0]/90 leading-relaxed">
            <MiniStep n={1}>
              Wait for the host to start the room and give you its <span className="text-[#c8942a]">address</span>,
              which looks like <code className={code}>archipelago.gg:38281</code>.
            </MiniStep>
            <MiniStep n={2}>
              <span className="text-[#c8942a]">Close Diablo II</span>, then double-click the app. Type in the room
              address and the name from your player file.
            </MiniStep>
            <MiniStep n={3}>
              The app downloads your game&apos;s mod, installs it and starts Diablo II. Choose{' '}
              <span className="text-[#c8942a]">Offline</span> and create a <span className="text-[#c8942a]">new
              character</span> of the class in your player file.
            </MiniStep>
            <MiniStep n={4}>
              Play, and keep the app open: it sends your checks, and your items arrive by themselves. There is
              nothing to drink or transmute.
            </MiniStep>
          </div>
          <p className="mt-4 rounded p-3 bg-[#0a2010]/60 border border-[#2a5a2a] text-xs text-[#6abf6a] leading-relaxed">
            ✓ If it worked, the app says <code className="text-[#8ad08a]">connected as &quot;YourName&quot;</code>,
            and skill points appear in your tree as other players find them. What you receive and send shows
            up in the game, beside the chat. Next time, double-click the app and press Enter to rejoin the
            same room.
          </p>
          <p className="mt-3 text-xs text-[#a89060] leading-relaxed">
            Type into the app&apos;s window to chat with the room; <code className={code}>!hint Progressive Skill Point</code>{' '}
            and the other <code className={code}>!</code> commands work as in any Archipelago client.
          </p>
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-4 pb-16">
        <h2 id="host" className={`${h2} scroll-mt-6`}>Hosting a game</h2>
        <div className="space-y-3 text-sm text-[#e8d5a0]/90 leading-relaxed">
          <MiniStep n={1}>
            Install{' '}
            <a href={ARCHIPELAGO_RELEASES} target="_blank" rel="noopener noreferrer" className={extLink}>Archipelago</a>{' '}
            {AP_MINIMUM_ARCHIPELAGO} or newer, then download{' '}
            <a href="/archipelago/d2rr.apworld" download className={extLink}>d2rr.apworld</a>{' '}
            <span className="text-[#a89060]">(version {AP_WORLD_VERSION})</span> and double-click it to add D2R
            Randomizer to Archipelago.
          </MiniStep>
          <MiniStep n={2}>
            Put every player&apos;s file in Archipelago&apos;s <code className={code}>Players</code> folder (the
            Launcher&apos;s <em>Browse Files</em> opens it) and click <em>Generate</em>.
          </MiniStep>
          <MiniStep n={3}>
            Host the result: <em>Host</em> in the Launcher, or upload the file from Archipelago&apos;s{' '}
            <code className={code}>output</code> folder to{' '}
            <a href={ARCHIPELAGO_UPLOADS} target="_blank" rel="noopener noreferrer" className={extLink}>archipelago.gg</a>{' '}
            to host it online. Share the room&apos;s address with everyone.
          </MiniStep>
        </div>
        <p className="mt-4 text-xs text-[#a89060] leading-relaxed">
          A first game: Andariel on Normal is about an hour and shows the whole loop.
        </p>

        <h2 className={h2}>If something goes wrong</h2>
        <ul className="space-y-3 text-sm text-[#e8d5a0]/90 leading-relaxed">
          <li>
            <span className="text-[#c8942a]">The app is waiting.</span> It says why about once a minute, for
            example &ldquo;close Diablo II to install this room&apos;s mod&rdquo;. Do what it says; it carries on by itself.
          </li>
          <li>
            <span className="text-[#c8942a]">No skill points yet.</span> Points arrive a second or two after the
            room sends them, while the app says connected and your character is in a game. Now and then the
            game has to make room first; they then arrive after your next level-up, quest or item.
          </li>
          <li>
            <span className="text-[#c8942a]">Diablo II isn&apos;t found.</span> The app asks for the folder that
            holds <code className={code}>D2R.exe</code> and remembers it.
          </li>
          <li>
            <span className="text-[#c8942a]">Windows won&apos;t run the app at all.</span> Some PCs have
            <em> Smart App Control</em> on, which blocks apps that are not code-signed. Use another PC for
            now.
          </li>
          <li>
            <span className="text-[#c8942a]">Playing Nightmare or Hell.</span> Start the app from a command
            prompt as <code className={code}>d2rr-ap.exe -difficulty 1</code> (Nightmare) or{' '}
            <code className={code}>-difficulty 2</code> (Hell), so area checks count for the right difficulty. It
            still asks for the room as usual.
          </li>
          <li>
            <span className="text-[#c8942a]">Still stuck?</span> With your character loaded, run{' '}
            <code className={code}>d2rr-ap.exe doctor</code>: it checks the install and your character and changes
            nothing. Send its output with your report.
          </li>
        </ul>

        <p className="mt-10 text-xs text-[#a89060]/80 leading-relaxed">
          Offline only. This site speaks mod contract {AP_CONTRACT_VERSION}; the app and the apworld on this page
          always match it. D2R Randomizer is not affiliated with Archipelago or Blizzard Entertainment.
        </p>
      </section>
    </main>
  );
}
