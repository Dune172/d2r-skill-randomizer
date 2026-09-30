'use client';

import { useState, useEffect, useRef } from 'react';

/**
 * Shared option controls. Mirrors RandomizerForm's controls so the skill
 * builder's options panel looks the same. RandomizerForm keeps its own copies
 * (it has its own disabled states); keep the two visually in step.
 */

export function Tip({ text, align = 'center', width = 'w-56', below = false }: { text: string; align?: 'center' | 'right'; width?: string; below?: boolean }) {
  // Hover reveals on desktop; tap toggles `open` so the tooltip is reachable on touch.
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const pos = below ? 'top-full mt-2' : 'bottom-full mb-2';
  const alignCls = align === 'right' ? 'right-0' : 'left-1/2 -translate-x-1/2';

  return (
    <span ref={ref} className="relative group/tip inline-flex items-center ml-1.5">
      <button
        type="button"
        aria-label="More information"
        onClick={e => { e.preventDefault(); e.stopPropagation(); setOpen(o => !o); }}
        className="text-[#5a3820] hover:text-[#c8a870] text-[11px] leading-none select-none transition-colors cursor-help"
      >
        ⓘ
      </button>
      <span className={`pointer-events-none absolute ${pos} ${alignCls} z-20 ${width} rounded border border-[#3a1510] bg-[#0d0305] px-2.5 py-1.5 text-xs text-[#c8a870] leading-relaxed shadow-lg transition-opacity duration-150 text-left whitespace-normal group-hover/tip:opacity-100 ${open ? 'opacity-100' : 'opacity-0'}`}>
        {text}
      </span>
    </span>
  );
}

export function Checkbox({ id, checked, onChange, label, tooltip }: { id: string; checked: boolean; onChange: (v: boolean) => void; label: string; tooltip?: string }) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer group select-none" htmlFor={id}>
      <div className="relative flex-shrink-0">
        <input id={id} type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="sr-only" />
        <div className={`w-5 h-5 rounded border transition-all duration-200 flex items-center justify-center
          ${checked ? 'bg-[#7a1010] border-[#c42020]' : 'bg-[#090203] border-[#3a1510] group-hover:border-[#5c2218]'}`}>
          {checked && (
            <svg className="w-3 h-3 text-[#f0c040]" viewBox="0 0 12 12" fill="none">
              <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>
      </div>
      <span className="text-sm text-[#c8a870] group-hover:text-[#f0d090] transition-colors flex items-center">
        {label}
        {tooltip && <Tip text={tooltip} />}
      </span>
    </label>
  );
}

export function ActPillRow({
  acts,
  selected,
  onToggle,
  label = 'Acts',
  labels = ['I', 'II', 'III', 'IV', 'V'],
}: {
  acts: readonly number[];
  selected: number[];
  onToggle: (act: number) => void;
  label?: string;
  labels?: readonly string[];
}) {
  const actLabels = labels;
  return (
    <div className="ml-1 pl-3 border-l-2 border-[#7a1010]/60 mt-2">
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-[#c8a870] font-cinzel tracking-wide mr-0.5">{label}</span>
        {acts.map(act => {
          const active = selected.includes(act);
          return (
            <button
              key={act}
              type="button"
              onClick={() => onToggle(act)}
              className={
                active
                  ? 'px-2.5 py-0.5 rounded text-xs font-cinzel tracking-wide border border-[#8b2820] bg-[#3a0808] text-[#f0c040] transition-all duration-150 select-none'
                  : 'px-2.5 py-0.5 rounded text-xs font-cinzel tracking-wide border border-[#3a1510] bg-[#090203] text-[#7a5030] transition-all duration-150 hover:border-[#5c2218] hover:text-[#c8a870] select-none'
              }
            >
              {actLabels[act - 1]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-px flex-1 bg-[#3a1510]/50" />
      <span className="font-cinzel text-[10px] tracking-[0.28em] uppercase text-[#c8a870]">{label}</span>
      <div className="h-px flex-1 bg-[#3a1510]/50" />
    </div>
  );
}
