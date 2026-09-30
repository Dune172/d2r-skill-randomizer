'use client';

import type { CatalogPage } from '@/lib/builder/catalog';
import { classNameOf } from '@/lib/builder/class-build';
import { CLASS_DEFS } from '@/lib/randomizer/config';
import { classTheme } from '@/lib/ui/class-theme';

/** 6×3 socket map of a page — the shape is what a player picks a layout by. */
export function MiniLayout({ page, size = 'sm' }: { page: CatalogPage; size?: 'sm' | 'md' }) {
  const filled = new Set(page.slots.filter(s => s.status === 'FILLED').map(s => `${s.row}-${s.col}`));
  const cell = size === 'md' ? 'w-3.5 h-3.5' : 'w-2 h-2';
  return (
    <div className="grid grid-cols-3 gap-[2px]" aria-hidden="true">
      {Array.from({ length: 18 }, (_, i) => {
        const on = filled.has(`${Math.floor(i / 3) + 1}-${(i % 3) + 1}`);
        return <span key={i} className={`${cell} ${on ? 'bg-[#c8942a]' : 'bg-[#2a2420]'}`} />;
      })}
    </div>
  );
}

/**
 * All 24 vanilla tree pages, grouped by class. A page brings its socket layout,
 * its artwork and its prerequisite arrows (baked into the art) — which is why
 * layouts are chosen from real pages rather than drawn freehand.
 */
export default function PagePicker({
  pages, value, onPick,
}: {
  pages: CatalogPage[];
  value: string;
  onPick: (key: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {CLASS_DEFS.map(def => (
        <div key={def.code} className="rounded border border-[#2a1510] bg-[#0a0304] p-2">
          <div className="font-cinzel text-[10px] tracking-[0.18em] uppercase mb-1.5"
            style={{ color: classTheme(def.code).frame }}>
            {classNameOf(def.code)}
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {pages.filter(p => p.classCode === def.code).map(page => {
              const active = page.key === value;
              return (
                <button
                  key={page.key}
                  type="button"
                  onClick={() => onPick(page.key)}
                  aria-pressed={active}
                  title={`${classNameOf(page.classCode)} — ${page.label}`}
                  className={`flex flex-col items-center gap-1 rounded border px-1 py-1.5 transition-colors ${
                    active
                      ? 'border-[#f0c040] bg-[#2a1a06]'
                      : 'border-[#2a1510] bg-[#0c0405] hover:border-[#7a3020]'
                  }`}
                >
                  <MiniLayout page={page} />
                  <span className={`text-[9px] leading-tight text-center ${active ? 'text-[#f0d090]' : 'text-[#8a7a5a]'}`}>
                    {page.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
