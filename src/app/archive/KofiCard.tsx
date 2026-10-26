/**
 * Inline Ko-fi appeal for the archive page. It used to be a full-screen modal
 * that blocked the page for two seconds on every visit; an inline card asks
 * the same thing without getting in the way.
 */
export function KofiCard() {
  return (
    <aside
      aria-labelledby="kofi-card-title"
      className="card-ornate max-w-xl mx-auto border border-[#3a1510] border-t-2 border-t-[#c8942a]/40 bg-[#0c0304] panel-shadow shadow-[inset_0_1px_0_rgba(200,148,42,0.15)] p-6 text-center"
    >
      <p className="font-cinzel text-[10px] tracking-[0.4em] text-[#8a7040] uppercase mb-2">
        A Word From Dune
      </p>
      <h2
        id="kofi-card-title"
        className="font-cinzel font-black text-xl text-[#c8942a] tracking-[0.12em] uppercase mb-3 leading-tight"
      >
        Enjoying The Randomizer?
      </h2>
      <p className="text-[#a89060] text-sm leading-relaxed mb-5">
        D2R Randomizer is a free fan project. If you&apos;re enjoying the monthly challenges, a coin on
        Ko-fi helps keep the seeds rolling.
      </p>
      <a
        href="https://ko-fi.com/d2rrando"
        target="_blank"
        rel="noopener noreferrer"
        className="btn-shimmer inline-block font-cinzel tracking-[0.2em] uppercase text-xs px-6 py-2.5
          bg-[#7a1f0a] hover:bg-[#9a2c0f] border border-[#c8942a]/40 text-[#e8c87a]
          transition-colors panel-shadow"
      >
        Support on Ko-fi
      </a>
    </aside>
  );
}
