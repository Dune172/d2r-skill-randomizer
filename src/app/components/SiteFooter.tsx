import Link from 'next/link';

const infoLinks = [
  { href: '/about', label: 'About' },
  { href: '/guide/install', label: 'Install Guide' },
  { href: '/faq', label: 'FAQ' },
  { href: '/mutations', label: 'Mutations' },
  { href: '/contact', label: 'Contact' },
  { href: '/terms', label: 'Terms' },
  { href: '/privacy', label: 'Privacy Policy' },
];

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
            href="https://ko-fi.com/d2rrando"
            target="_blank"
            rel="noopener noreferrer"
            className="font-cinzel text-[10px] tracking-[0.3em] uppercase px-3 py-1.5 text-[#a87830] hover:text-[#c8942a] transition-colors"
          >
            Ko-fi
          </a>
          <span className="text-[#3a1510] select-none">|</span>
          <Link
            href="/multiplayer"
            className="font-cinzel text-[10px] tracking-[0.3em] uppercase px-3 py-1.5 text-[#a87830] hover:text-[#c8942a] transition-colors"
          >
            Multiplayer
          </Link>
          <span className="text-[#3a1510] select-none">|</span>
          <Link
            href="/changelog"
            className="font-cinzel text-[10px] tracking-[0.3em] uppercase px-3 py-1.5 text-[#a87830] hover:text-[#c8942a] transition-colors"
          >
            Patch Notes
          </Link>
        </nav>

        {/* Site info row */}
        <nav aria-label="Site information" className="flex items-center justify-center gap-x-1 gap-y-1 flex-wrap mb-6 -mt-3">
          {infoLinks.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="px-3 py-1.5 text-xs text-[#a89060] hover:text-[#c8942a] transition-colors"
            >
              {label}
            </Link>
          ))}
        </nav>

        {/* Disclaimer block */}
        <div className="max-w-3xl mx-auto text-center space-y-3">
          <p className="text-[#7a5818]/90 text-[11px] leading-relaxed">
            Diablo® II: Resurrected is a trademark of Blizzard Entertainment, Inc. D2R Randomizer is an independent fan project and is{' '}
            <span className="text-[#a87830]">not affiliated with, endorsed, sponsored, or approved by Blizzard Entertainment</span>.
          </p>
          <p className="text-[#7a5818]/80 text-[11px] leading-relaxed">
            Use at your own risk. This mod is provided as-is for offline play only: single-player, or TCP/IP with offline characters.{' '}
            <span className="text-[#a87830]">Never use with Battle.net online characters.</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
