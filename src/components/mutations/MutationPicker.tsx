'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { MUTATIONS } from '@/lib/mutations/registry';
import { PICKABLE_MUTATION_IDS, findMutationConflict, mutationName, normalizeMutationIds } from '@/lib/mutations/custom';

/**
 * Pick any number of mutations for a generated mod (Random Seed and Class Builder).
 *
 * A tile is disabled when it conflicts with a picked mutation, or when `blocked`
 * (the caller's other options) returns a reason. If an option change blocks a
 * mutation that is already picked, it is dropped with a notice, so the request
 * never carries a set the server would reject.
 */
export default function MutationPicker({
  value,
  onChange,
  blocked,
  idPrefix = 'mut',
}: {
  value: number[];
  onChange: (next: number[]) => void;
  blocked?: (id: number) => string | null;
  idPrefix?: string;
}) {
  const [open, setOpen] = useState(value.length > 0);
  const [focusId, setFocusId] = useState<number | null>(null);
  const [notice, setNotice] = useState('');

  const reasonFor = (id: number): string | null => {
    const other = findMutationConflict(id, value.filter(v => v !== id));
    if (other !== null) return `Can't be combined with ${mutationName(other)}`;
    return blocked?.(id) ?? null;
  };

  // Drop picks that another option has since ruled out.
  const blockedKey = PICKABLE_MUTATION_IDS.map(id => (blocked?.(id) ? id : '')).join(',');
  useEffect(() => {
    if (!blocked) return;
    const dropped = value.filter(id => blocked(id));
    if (!dropped.length) return;
    onChange(value.filter(id => !dropped.includes(id)));
    setNotice(`Removed ${dropped.map(mutationName).join(', ')}: ${blocked(dropped[0])}.`);
  }, [blockedKey]); // only when what's blocked changes, not on every new `blocked` closure

  const toggle = (id: number) => {
    setNotice('');
    setFocusId(id);
    onChange(value.includes(id) ? value.filter(v => v !== id) : normalizeMutationIds([...value, id]));
  };

  const summary = value.length
    ? value.map(mutationName).join(' · ')
    : 'None — add rule changes on top of your seed';
  const detail = focusId !== null ? MUTATIONS[focusId] : null;
  const detailReason = focusId !== null && !value.includes(focusId) ? reasonFor(focusId) : null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          aria-controls={`${idPrefix}-grid`}
          className="flex items-center gap-2 min-w-0 text-left"
        >
          <span className={`text-[#c8942a] text-[14px] transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>▾</span>
          <span className="text-sm text-[#c8a870] truncate">
            {value.length > 0 && <span className="text-[#f0c040] font-semibold mr-1.5">{value.length}</span>}
            {summary}
          </span>
        </button>
        {value.length > 0 && (
          <button
            type="button"
            onClick={() => { setNotice(''); onChange([]); }}
            className="flex-shrink-0 text-[11px] font-cinzel tracking-[0.15em] uppercase text-[#7a5030] hover:text-[#c8a870] transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {notice && <p role="status" className="text-[11px] text-[#e0a050]">{notice}</p>}

      {open && (
        <div id={`${idPrefix}-grid`} className="space-y-3">
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
            {PICKABLE_MUTATION_IDS.map(id => {
              const def = MUTATIONS[id];
              const picked = value.includes(id);
              const reason = picked ? null : reasonFor(id);
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={picked}
                  aria-label={reason ? `${def.name} (${reason})` : def.name}
                  disabled={!!reason}
                  title={reason ?? def.description}
                  onClick={() => toggle(id)}
                  onMouseEnter={() => setFocusId(id)}
                  onFocus={() => setFocusId(id)}
                  className={`group relative flex flex-col items-center gap-1 rounded border p-2 transition-all duration-150 select-none
                    ${picked
                      ? 'border-[#c8942a] bg-[#2a0a06] shadow-[0_0_12px_rgba(200,148,42,0.25)]'
                      : 'border-[#3a1510] bg-[#090203] hover:border-[#7a3020]'}
                    disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:border-[#3a1510]`}
                >
                  <span className="relative w-12 h-12 flex items-center justify-center">
                    <Image
                      src={`/mutations/${def.id}.webp`}
                      alt=""
                      width={48}
                      height={48}
                      sizes="48px"
                      className={`object-contain ${picked ? '' : 'opacity-80 group-hover:opacity-100'}`}
                    />
                    {picked && (
                      <span aria-hidden className="absolute -top-1 -right-1 rounded-full bg-[#c8942a] text-[#0c0304] text-[10px] leading-none w-4 h-4 flex items-center justify-center font-bold">✓</span>
                    )}
                  </span>
                  <span className={`font-cinzel text-[10px] leading-tight text-center tracking-wide ${picked ? 'text-[#f0c040]' : 'text-[#c8a870]'}`}>
                    {def.name}
                  </span>
                </button>
              );
            })}
          </div>

          <div aria-live="polite" className="min-h-[3.5rem] rounded border border-[#3a1510]/60 bg-[#090203]/60 px-3 py-2">
            {detail ? (
              <>
                <p className="font-cinzel text-[11px] tracking-[0.12em] text-[#c8942a]">{detail.emoji} {detail.name}</p>
                <p className="text-[11px] text-[#a89060] leading-snug mt-0.5">{detail.description}</p>
                {detailReason && <p className="text-[11px] text-[#e0a050] mt-1">{detailReason}.</p>}
              </>
            ) : (
              <p className="text-[11px] text-[#7a6a4a] leading-snug">Hover or tap a mutation to read what it does. Pick as many as you like.</p>
            )}
          </div>

          <p className="text-[11px] text-[#8a7040] italic">
            Mutated mods use their own save folder — start a new character to play one.
          </p>
        </div>
      )}
    </div>
  );
}
