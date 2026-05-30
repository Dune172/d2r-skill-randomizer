import Link from 'next/link';

export default function SiteFooter() {
  return (
    <footer className="mt-auto bg-[#060203]">
      {/* Top accent line */}
      <div className="flex items-center">
        <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[#7a5818] to-[#c8942a]" />
        <span className="text-[#c8942a] text-[8px] px-2">◆</span>
        <div className="flex-1 h-px bg-gradient-to-l from-transparent via-[#7a5818] to-[#c8942a]" />
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Links row */}
        <nav className="flex items-center justify-center gap-1 flex-wrap mb-6">
          <a
            href="https://discord.gg/y5r2sTxwS5"
            target="_blank"
            rel="noopener noreferrer"
            className="font-cinzel text-[10px] tracking-[0.3em] uppercase px-3 py-1.5 text-[#a87830] hover:text-[#c8942a] transition-colors"
          >
            Discord
          </a>
          <span className="text-[#3a1510] select-none">|</span>
          <a
            href="https://patreon.com/D2RR?utm_medium=unknown&utm_source=join_link&utm_campaign=creatorshare_creator&utm_content=copyLink"
            target="_blank"
            rel="noopener noreferrer"
            className="font-cinzel text-[10px] tracking-[0.3em] uppercase px-3 py-1.5 text-[#a87830] hover:text-[#c8942a] transition-colors"
          >
            Patreon
          </a>
          <span className="text-[#3a1510] select-none">|</span>
          <Link
            href="/changelog"
            className="font-cinzel text-[10px] tracking-[0.3em] uppercase px-3 py-1.5 text-[#a87830] hover:text-[#c8942a] transition-colors"
          >
            Patch Notes
          </Link>
        </nav>

        {/* Disclaimer block */}
        <div className="max-w-3xl mx-auto text-center space-y-3">
          <p className="text-[#7a5818]/90 text-[11px] leading-relaxed">
            Diablo® II: Resurrected is a trademark of Blizzard Entertainment, Inc. D2R Randomizer is an independent fan project and is{' '}
            <span className="text-[#a87830]">not affiliated with, endorsed, sponsored, or approved by Blizzard Entertainment</span>.
          </p>
          <p className="text-[#7a5818]/80 text-[11px] leading-relaxed">
            Use at your own risk. This mod is provided as-is for offline, single-player use only.{' '}
            <span className="text-[#a87830]">Never use with Battle.net online characters.</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
