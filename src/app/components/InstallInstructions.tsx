export function InstallInstructions({ seed }: { seed: number }) {
  const seedUnsigned = seed >>> 0;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-[#c8a870]">
      {/* Battle.net column */}
      <div className="space-y-2 border border-[#2a1508]/60 rounded p-3 bg-[#080203]/40">
        <p className="font-cinzel text-[11px] tracking-[0.22em] uppercase text-[#c8942a] mb-2">Battle.net</p>
        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full border border-[#c8942a] text-[#c8942a] text-[10px] font-bold flex-shrink-0 mt-0.5">1</span>
            <span>Extract the ZIP anywhere — your Desktop is fine.</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full border border-[#c8942a] text-[#c8942a] text-[10px] font-bold flex-shrink-0 mt-0.5">2</span>
            <div>
              In your D2R install folder, open or create a{' '}
              <code className="text-[#a89858]">mods\</code>
              {' '}folder.
              <div className="mt-1 text-[#7a7858]">Default location: <code className="text-[#7a7858] break-all">C:\Program Files (x86)\Diablo II Resurrected\</code></div>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full border border-[#c8942a] text-[#c8942a] text-[10px] font-bold flex-shrink-0 mt-0.5">3</span>
            <div>
              Copy the extracted folder (e.g.{' '}
              <code className="text-[#a89858]">seed{seed}\</code>
              ) into the{' '}
              <code className="text-[#a89858]">mods\</code>
              {' '}folder.
              <div className="mt-1 text-[#7a7858] italic">The folder name matches your seed number — this is normal.</div>
            </div>
          </div>
        </div>
        <div className="pt-1">
          <p className="text-[#7a7858] mb-1.5">Choose a launch method:</p>
          <div className="space-y-2">
            <div className="flex items-start gap-2">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full border border-[#c8942a] text-[#c8942a] text-[10px] font-bold flex-shrink-0 mt-0.5">4a</span>
              <div>
                <span className="text-[#c8942a] font-semibold">Easy</span>{' '}
                <span className="text-[#4a7a4a] border border-[#4a7a4a] rounded px-1 text-[10px]">recommended</span>
                <div className="mt-0.5">Double-click the included shortcut:</div>
                <code className="block text-[#a89858] mt-0.5">D2R Randomizer {seed}.lnk</code>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full border border-[#c8942a] text-[#c8942a] text-[10px] font-bold flex-shrink-0 mt-0.5">4b</span>
              <div>
                <span className="text-[#c8a870]">Manual</span> — In Battle.net, go to D2R → <em>Settings</em> → <em>Game Settings</em> → <em>Additional Command Line Arguments</em> and add:
                <code className="block text-[#a89858] break-all mt-0.5">-mod seed{seed} -txt -seed {seedUnsigned}</code>
              </div>
            </div>
          </div>
        </div>
        <div className="mt-2 rounded p-2 bg-[#0a2010]/60 border border-[#2a5a2a] text-[#6abf6a]">
          ✓ If it worked, your new character&apos;s skill tree will show randomized skills.
        </div>
      </div>

      {/* Steam column */}
      <div className="space-y-2 border border-[#2a1508]/60 rounded p-3 bg-[#080203]/40">
        <p className="font-cinzel text-[11px] tracking-[0.22em] uppercase text-[#c8942a] mb-2">Steam</p>
        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full border border-[#c8942a] text-[#c8942a] text-[10px] font-bold flex-shrink-0 mt-0.5">1</span>
            <span>Extract the ZIP anywhere — your Desktop is fine.</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full border border-[#c8942a] text-[#c8942a] text-[10px] font-bold flex-shrink-0 mt-0.5">2</span>
            <div>
              In your D2R install folder, open or create a{' '}
              <code className="text-[#a89858]">mods/</code>
              {' '}folder.
              <div className="mt-1 text-[#7a7858]">Default location: <code className="text-[#7a7858] break-all">C:\Program Files (x86)\Steam\steamapps\common\Diablo II Resurrected\</code></div>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full border border-[#c8942a] text-[#c8942a] text-[10px] font-bold flex-shrink-0 mt-0.5">3</span>
            <div>
              Copy the extracted folder (e.g.{' '}
              <code className="text-[#a89858]">seed{seed}/</code>
              ) into the{' '}
              <code className="text-[#a89858]">mods/</code>
              {' '}folder.
              <div className="mt-1 text-[#7a7858] italic">The folder name matches your seed number — this is normal.</div>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full border border-[#c8942a] text-[#c8942a] text-[10px] font-bold flex-shrink-0 mt-0.5">4</span>
            <div>
              In Steam, right-click D2R → <em>Properties</em> → <em>General</em> → <em>Launch Options</em> and add:
              <code className="block text-[#a89858] break-all mt-0.5">-mod seed{seed} -txt -seed {seedUnsigned}</code>
            </div>
          </div>
        </div>
        <div className="mt-2 rounded p-2 bg-[#0a2010]/60 border border-[#2a5a2a] text-[#6abf6a]">
          ✓ If it worked, your new character&apos;s skill tree will show randomized skills.
        </div>
        <div className="mt-1 rounded p-2 bg-[#080203]/60 border border-[#2a1508]/60 text-[#7a7858]">
          <span className="text-[#c8a870] font-semibold">Game Pass?</span> Use the Microsoft Store install path instead. If you&apos;re unsure where D2R is installed, search <code className="text-[#a89858]">Diablo II Resurrected</code> in File Explorer.
        </div>
      </div>
    </div>
  );
}
