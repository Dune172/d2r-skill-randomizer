'use client';

import { useEffect, useState } from 'react';

export function KofiPopup() {
  const [open, setOpen] = useState(true);
  const [closeable, setCloseable] = useState(false);

  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => setCloseable(true), 2000);
    return () => clearTimeout(id);
  }, [open]);

  useEffect(() => {
    if (!open || !closeable) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, closeable]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="kofi-popup-title"
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/70 backdrop-blur-sm anim-fade-up"
      onClick={() => { if (closeable) setOpen(false); }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card-ornate relative max-w-md w-full border border-[#3a1510] border-t-2 border-t-[#c8942a]/40 bg-[#0c0304] panel-shadow shadow-[inset_0_1px_0_rgba(200,148,42,0.15)] p-8 text-center"
      >
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close"
          disabled={!closeable}
          className={`absolute top-3 right-3 w-8 h-8 flex items-center justify-center
            text-[#7a5818] hover:text-[#c8942a] transition-all duration-300
            ${closeable ? 'opacity-100 cursor-pointer' : 'opacity-0 pointer-events-none'}`}
        >
          <span aria-hidden="true" className="text-xl leading-none">×</span>
        </button>

        <p className="font-cinzel text-[10px] tracking-[0.4em] text-[#8a7040] uppercase mb-3">
          A Word From Dune
        </p>
        <h2
          id="kofi-popup-title"
          className="font-cinzel font-black text-2xl md:text-3xl text-[#c8942a] glow-gold tracking-[0.12em] uppercase mb-4 leading-tight"
        >
          Enjoying The Randomizer?
        </h2>
        <p className="text-[#a89060] text-sm leading-relaxed mb-6">
          D2R Randomizer is a free, ad-free passion project. If you&apos;re digging the weekly challenges,
          consider tossing a coin to your randomizer-maker on Ko-fi. Every bit keeps the seeds rolling.
        </p>

        <a
          href="https://ko-fi.com/dune172"
          target="_blank"
          rel="noopener noreferrer"
          className="btn-shimmer inline-block font-cinzel tracking-[0.2em] uppercase text-sm px-8 py-3
            bg-[#7a1f0a] hover:bg-[#9a2c0f] border border-[#c8942a]/40 text-[#e8c87a]
            transition-colors panel-shadow"
        >
          Support on Ko-fi
        </a>

        <p className="text-[11px] text-[#8a7040] italic mt-5">
          Thanks for playing — Dune
        </p>
      </div>
    </div>
  );
}
