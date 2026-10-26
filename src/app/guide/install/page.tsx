import type { Metadata } from 'next';
import Link from 'next/link';
import ContentPage, { contentMetadata } from '@/app/components/ContentPage';

export const revalidate = 3600;

export const metadata: Metadata = contentMetadata(
  '/guide/install',
  'How to Install a D2R Randomizer Mod',
  'Step-by-step guide to installing a D2R Randomizer mod in Diablo 2 Resurrected on Battle.net, Steam or Game Pass, plus launch options, uninstalling and troubleshooting.',
);

const howToSchema = {
  '@context': 'https://schema.org',
  '@type': 'HowTo',
  name: 'How to install a D2R Randomizer mod',
  description: 'Install a randomized skill tree mod for Diablo II: Resurrected and launch it in offline mode.',
  totalTime: 'PT5M',
  tool: [{ '@type': 'HowToTool', name: 'Diablo II: Resurrected (PC)' }],
  step: [
    { '@type': 'HowToStep', name: 'Generate and download the mod', text: 'Open the generator, pick a seed and options, and download the ZIP file.' },
    { '@type': 'HowToStep', name: 'Extract the ZIP', text: 'Extract the ZIP anywhere, such as your Desktop. It contains one folder named after your seed or build, plus a launch shortcut.' },
    { '@type': 'HowToStep', name: 'Copy the folder into mods', text: 'Copy the extracted mod folder into the mods folder inside your Diablo II: Resurrected install folder. Create mods if it does not exist.' },
    { '@type': 'HowToStep', name: 'Add the launch options', text: 'Use the included shortcut, or add -mod followed by the folder name and -txt to the game launch options in Battle.net or Steam.' },
    { '@type': 'HowToStep', name: 'Create a new offline character', text: 'Start the game, create a new offline character, and open the skill tree to confirm the skills are randomized.' },
  ],
};

export default function InstallGuidePage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(howToSchema) }} />
      <ContentPage
        eyebrow="Guide"
        title="How to Install a D2R Randomizer Mod"
        updated="2026-10-26"
        intro={
          <p>
            A D2R Randomizer mod is a small folder of game data files that Diablo II: Resurrected loads
            in place of its own. Installing one takes about five minutes and doesn&apos;t change your normal
            game install. Remove the launch option and the game is back to vanilla. This guide covers
            Battle.net, Steam and Game Pass installs, how to check the mod loaded, and what to do when it
            doesn&apos;t.
          </p>
        }
        related={[
          { href: '/generate', label: 'Generate a mod' },
          { href: '/faq', label: 'FAQ' },
          { href: '/multiplayer', label: 'Multiplayer guide' },
        ]}
      >
        <h2>Before you start</h2>
        <ul>
          <li>
            You need the PC version of <strong>Diablo II: Resurrected</strong>. The Reign of the Warlock
            expansion is supported, and the Warlock class is shuffled along with the original seven.
          </li>
          <li>
            Mods only work <strong>offline</strong>: single-player, or TCP/IP multiplayer with offline
            characters. Battle.net online play ignores mods, and you should never try to bring a modded
            character online.
          </li>
          <li>
            Close the game before installing or switching mods. D2R reads the mod files when it starts.
          </li>
        </ul>

        <h2>Step 1: Generate and download your mod</h2>
        <p>
          Open the <Link href="/generate">generator</Link>. Type a seed number, or leave the box empty to
          get a random one. The seed decides which skill trees each class receives, and the same seed with
          the same options always produces the same mod, so you can share it with friends. Choose any
          options you want (monster shuffling, a Teleport staff, faster leveling and so on), then press
          Generate. When the mod is built, click Download to save the ZIP file.
        </p>
        <p>
          To play the monthly challenge instead, use the download button on the{' '}
          <Link href="/challenge">challenge page</Link>. Its seed and settings are fixed so every player
          gets the same run.
        </p>

        <h2>Step 2: Extract the ZIP</h2>
        <p>
          Right-click the ZIP and choose <em>Extract All</em>, or use 7-Zip or WinRAR. Extract it anywhere;
          your Desktop is fine. Inside you&apos;ll find:
        </p>
        <ul>
          <li>
            A <strong>mod folder</strong> named after your seed, such as <code>seed12345</code>. Class
            Builder mods are named after the build instead. This folder holds the modified game data and
            the skill tree artwork.
          </li>
          <li>
            A <strong>launch shortcut</strong> named <code>D2R Randomizer 12345.lnk</code>. It is an
            ordinary Windows shortcut that starts the game with the right launch options. It contains no
            program code of its own.
          </li>
        </ul>

        <h2>Step 3: Copy the mod folder into the game&apos;s mods folder</h2>
        <p>
          Open your Diablo II: Resurrected install folder. Inside it, open the <code>mods</code>{' '}folder,
          or create it if it doesn&apos;t exist (all lower case). Copy the mod folder into it, so you end up
          with a path like <code>Diablo II Resurrected\mods\seed12345\</code>.
        </p>
        <p>Default install folders:</p>
        <ul>
          <li>Battle.net: <code>C:\Program Files (x86)\Diablo II Resurrected\</code></li>
          <li>Steam: <code>C:\Program Files (x86)\Steam\steamapps\common\Diablo II Resurrected\</code></li>
          <li>
            Game Pass / Microsoft Store: the folder you chose when installing through the Xbox app. If
            you&apos;re not sure, search for <code>Diablo II Resurrected</code> in File Explorer.
          </li>
        </ul>
        <p>
          Copy the folder itself, not the files inside it. A common mistake is ending up with a doubled
          path such as <code>mods\seed12345\seed12345\</code>. If that happens, move the inner folder up
          one level.
        </p>

        <h2>Step 4: Launch the game with the mod</h2>
        <h3>Option A: the included shortcut (Battle.net, default folder)</h3>
        <p>
          Double-click <code>D2R Randomizer 12345.lnk</code>. It starts <code>D2R.exe</code> from the
          default Battle.net install folder with the mod already selected. Keep the Battle.net app running
          in the background. If you installed the game somewhere else, or you play on Steam, use option B.
        </p>
        <h3>Option B: launch options</h3>
        <p>
          Tell the game which mod to load with two launch options: <code>-mod</code> followed by the folder
          name, and <code>-txt</code>, which makes the game read the mod&apos;s data files.
        </p>
        <ul>
          <li>
            <strong>Battle.net:</strong> select Diablo II: Resurrected, click the gear icon next to Play,
            open <em>Game Settings</em>, tick <em>Additional command line arguments</em> and enter{' '}
            <code>-mod seed12345 -txt</code>.
          </li>
          <li>
            <strong>Steam:</strong> right-click the game in your library, choose <em>Properties</em>, and
            under <em>General</em> → <em>Launch Options</em> enter <code>-mod seed12345 -txt</code>.
          </li>
        </ul>
        <p>
          Replace <code>seed12345</code> with your folder&apos;s exact name. If you ticked{' '}
          <strong>Race Mode</strong> on the generator, also add <code>-seed</code> and the number shown on
          the download screen. That locks the map layout so every racer gets the same maps.
        </p>

        <h2>Step 5: Check that it worked</h2>
        <p>
          Start the game, choose an <strong>offline</strong> character slot and create a new character. Then
          open the skill tree (default key <code>T</code>). If the trees show skills from other classes,
          such as a Sorceress with Barbarian war cries, the mod is loaded.
        </p>
        <p>
          Use a new character for each new seed. A character made on one seed keeps its skill points in
          specific slots, and those slots hold different skills on another seed.
        </p>
        <p>
          Some options change the start. With <strong>Forgotten Arts</strong>, skill trees are disabled and
          a new character starts with a Fire Bolt scroll and a Horadric Cube. With the starting-item options
          you&apos;ll see a Teleport staff or Cube in your inventory.
        </p>

        <h2>Open Acts: installing the starter characters</h2>
        <p>
          If you picked <strong>Start with acts open</strong>, the mod folder in your ZIP has a{' '}
          <code>starter-saves</code> folder with level-1 characters (just your race class in Race Mode).
          Their Act II, or Act II and III, waypoint and quest tabs are already open in every difficulty.
          Characters you create yourself start with only Act I open.
        </p>
        <p>
          Copy the <code>.d2s</code> files into the mod&apos;s own save folder:{' '}
          <code>%USERPROFILE%\Saved Games\Diablo II Resurrected\mods\seed12345_openacts\</code>. In Race Mode
          the folder name also has your class, e.g. <code>seed12345nec_openacts</code>. The generator&apos;s
          install steps and the <code>README.txt</code> next to the saves give the exact name. Create the
          folder if it doesn&apos;t exist, or launch the mod once and it appears. Then pick the character from
          the list. The starters are built for one seed, so don&apos;t use them with another.
        </p>
        <p>
          <strong>Play one of the starter characters.</strong> A character you create in game starts with only
          Act I open. When quest items are shuffled too, the shuffle counts on the open acts, so such a character
          will usually get stuck before Duriel. To play with a character you make yourself, generate the seed
          with <strong>Shuffle quest items</strong> on and no acts selected: that shuffle works with any new
          character.
        </p>
        <p>
          With <strong>Shuffle quest items</strong>, the quest items are in new places across Acts I–III.
          The quest log hints at the act each one is in, and if you kept the spoiler file,{' '}
          <code>quest-shuffle.json</code> in the mod folder lists every exact spot.
        </p>

        <h2>Switching seeds and uninstalling</h2>
        <p>
          To play a different seed, copy its folder into <code>mods</code> next to the old one and change
          the <code>-mod</code>{' '}launch option to the new folder name, or use the new seed&apos;s shortcut.
          You can keep as many seed folders as you like; only the one named in the launch options loads.
        </p>
        <p>
          To go back to the normal game, clear the launch options (or simply launch from Battle.net or Steam
          instead of the shortcut). To remove a mod completely, delete its folder from <code>mods</code>.
          Nothing else on your PC is changed.
        </p>

        <h2>Troubleshooting</h2>
        <h3>The skill tree looks normal</h3>
        <p>
          The game didn&apos;t load the mod. Check that the folder name in <code>-mod</code> matches exactly,
          that <code>-txt</code> is present, that the folder sits directly inside <code>mods</code> (not
          doubled), and that you saved the launch options before starting the game.
        </p>
        <h3>The game crashes on start or shows an error</h3>
        <p>
          Make sure only one mod is selected and that the mod folder came from a single, complete download.
          A partially extracted ZIP is the usual cause. Delete the folder, extract the ZIP again and copy it
          back. Also check that the game is fully updated, since mods are built for the current patch.
        </p>
        <h3>The shortcut does nothing</h3>
        <p>
          The shortcut expects the default Battle.net install folder. If your game lives elsewhere, use the
          launch options from option B instead.
        </p>
        <h3>Running another mod at the same time</h3>
        <p>
          D2R loads one mod at a time. Combining the randomizer with large overhaul mods isn&apos;t
          supported, because both change the same skill files.
        </p>
        <h3>Still stuck?</h3>
        <p>
          Ask in the{' '}
          <a href="https://discord.gg/y5r2sTxwS5" target="_blank" rel="noopener noreferrer">D2R Randomizer Discord</a>{' '}
          or see the <Link href="/contact">contact page</Link>. Include your seed, your options, whether you
          use Battle.net or Steam, and a screenshot of the error.
        </p>

        <h2>Playing with friends</h2>
        <p>
          Everyone installs the same ZIP the same way, then follows the{' '}
          <Link href="/multiplayer">multiplayer guide</Link> to set up TCP/IP games with D2RLoader. The
          seed, options and mod files must match on every PC.
        </p>
      </ContentPage>
    </>
  );
}
