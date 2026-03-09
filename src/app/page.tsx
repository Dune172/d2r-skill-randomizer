import RandomizerApp from '@/app/components/RandomizerApp';

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'D2R Randomizer',
  applicationCategory: 'GameApplication',
  operatingSystem: 'Windows',
  url: 'https://d2rrandomizer.com',
  description: 'A free skill randomizer mod generator for Diablo 2: Resurrected.',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
};

export default function Home() {
  return (
    <main className="min-h-screen">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* ── Header ── */}
      <header className="border-b border-[#3a1510] bg-[#080204]/90 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 py-7">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[#7a5818] to-[#c8942a]" />
            <span className="text-[#c8942a] text-xs">◆</span>
            <div className="flex-1 h-px bg-gradient-to-l from-transparent via-[#7a5818] to-[#c8942a]" />
          </div>

          <h1 className="font-cinzel font-black tracking-[0.18em] text-4xl md:text-5xl text-[#c8942a] glow-gold uppercase text-center mb-2">
            D2R Randomizer
          </h1>
          <p className="text-center mt-2">
            <a
              href="https://ko-fi.com/dune172"
              target="_blank"
              rel="noopener noreferrer"
              className="font-cinzel text-[11px] tracking-[0.45em] text-[#a87830] hover:text-[#c8942a] transition-colors uppercase"
            >
              ☕ Support on Ko-fi
            </a>
          </p>

          <div className="flex items-center gap-3 mt-4">
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[#7a5818] to-[#c8942a]" />
            <span className="text-[#c8942a] text-xs">◆</span>
            <div className="flex-1 h-px bg-gradient-to-l from-transparent via-[#7a5818] to-[#c8942a]" />
          </div>
        </div>
      </header>

      <p className="text-center text-sm text-amber-900/60 max-w-xl mx-auto pt-6 -mb-2 px-4">
        A free mod generator for Diablo 2: Resurrected. Enter a seed to shuffle all skill trees
        across every class — then download and install the mod in minutes.
      </p>

      <RandomizerApp />
    </main>
  );
}
