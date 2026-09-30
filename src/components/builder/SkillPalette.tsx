'use client';

import { useMemo, useState } from 'react';
import type { CatalogSkill } from '@/lib/builder/catalog';
import { blockReason, classNameOf, partnersFor } from '@/lib/builder/class-build';
import { CLASS_DEFS } from '@/lib/randomizer/config';
import type { ClassCode } from '@/lib/randomizer/types';
import { classTheme } from '@/lib/ui/class-theme';
import { skillIconSrc, SKILL_ICON_TILE } from '@/lib/ui/skill-icons';
import { DRAG_TYPE, type DragPayload, readDrag } from './BuilderTreeGrid';

/**
 * Every skill not yet on the tree. Click to place (into the selected slot, or
 * the first empty one) or drag onto a slot; dropping a placed skill back here
 * removes it.
 */
export default function SkillPalette({
  skills, classCode, placed, targetLabel, onPick, onReturn,
}: {
  skills: CatalogSkill[];
  classCode: ClassCode;
  placed: Set<string>;
  /** Where a click will put the skill, for the tooltip. */
  targetLabel: string;
  onPick: (skill: string) => void;
  onReturn: (fromKey: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [source, setSource] = useState<string>('all');
  const [hideBlocked, setHideBlocked] = useState(true);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return skills.filter(s =>
      !placed.has(s.skill)
      && (source === 'all' || s.charclass === source)
      && (!hideBlocked || !blockReason(s.skill, classCode))
      && (!q || s.name.toLowerCase().includes(q) || s.skill.toLowerCase().includes(q)),
    );
  }, [skills, placed, source, hideBlocked, classCode, search]);

  const chip = (value: string, label: string, color?: string) => (
    <button
      key={value}
      type="button"
      onClick={() => setSource(value)}
      aria-pressed={source === value}
      style={source === value && color ? { borderColor: color, color } : undefined}
      className={`px-2 py-0.5 rounded border text-[10px] font-cinzel tracking-wider transition-colors ${
        source === value
          ? 'border-[#8b2820] bg-[#2a0808] text-[#f0c040]'
          : 'border-[#3a1510] bg-[#090203] text-[#7a5030] hover:text-[#c8a870]'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div
      className="rounded-lg border border-[#3a1510] overflow-hidden flex flex-col bg-[#0a0304]"
      onDragOver={e => { if (e.dataTransfer.types.includes(DRAG_TYPE)) e.preventDefault(); }}
      onDrop={e => {
        const payload = readDrag(e);
        if (payload?.from) { e.preventDefault(); onReturn(payload.from); }
      }}
    >
      <div className="px-3 py-2.5 bg-[#160607] border-b border-[#3a1510] space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-cinzel font-bold text-[11px] tracking-[0.18em] uppercase text-[#c8942a]">
            Skills <span className="text-[#7a6a4a]">({list.length})</span>
          </h3>
          <label className="flex items-center gap-1.5 text-[10px] text-[#8a7a5a] cursor-pointer select-none">
            <input type="checkbox" checked={hideBlocked} onChange={e => setHideBlocked(e.target.checked)}
              className="accent-[#8b2820]" />
            Hide unusable
          </label>
        </div>
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search skills…"
          aria-label="Search skills"
          className="w-full bg-[#090203] border border-[#3a1510] rounded px-2 py-1 text-xs text-[#c8a870] placeholder-[#5a4830] focus:border-[#7a3020] outline-none"
        />
        <div className="flex flex-wrap gap-1">
          {chip('all', 'All')}
          {CLASS_DEFS.map(d => chip(d.code, d.name, classTheme(d.code).frame))}
        </div>
      </div>

      <div className="max-h-[26rem] lg:max-h-[34rem] overflow-y-auto divide-y divide-[#1e0e0a]">
        {list.length === 0 && (
          <p className="px-3 py-6 text-center text-[11px] text-[#7a6a4a]">
            {search || source !== 'all' ? 'No matching skills.' : 'Every skill is placed.'}
          </p>
        )}
        {list.map(s => {
          const blocked = blockReason(s.skill, classCode);
          const partners = partnersFor(s);
          const needs = partners && !partners.some(p => placed.has(p))
            ? `Needs ${partners.length === 1 ? partners[0] : 'a partner'}` : null;
          return (
            <button
              key={s.skill}
              type="button"
              disabled={!!blocked}
              onClick={() => onPick(s.skill)}
              draggable={!blocked}
              onDragStart={e => {
                e.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ skill: s.skill } satisfies DragPayload));
                e.dataTransfer.effectAllowed = 'copyMove';
              }}
              title={[
                `${s.name} (${classNameOf(s.charclass)})`,
                s.desc,
                blocked ? `✖ ${blocked}` : null,
                !blocked && partners ? `Works only with ${partners.join(' or ')} on the same class.` : null,
                !blocked ? `Click to place in ${targetLabel}, or drag onto a slot.` : null,
              ].filter(Boolean).join('\n\n')}
              className={`w-full px-3 py-1.5 flex items-center gap-2 text-left transition-colors ${
                blocked ? 'opacity-40 cursor-not-allowed' : 'hover:bg-[#1a0808] cursor-grab'
              }`}
            >
              <img src={skillIconSrc(s.iconClass, s.iconCel)} alt="" width={SKILL_ICON_TILE} height={SKILL_ICON_TILE}
                loading="lazy" decoding="async" draggable={false}
                style={{ borderColor: classTheme(s.iconClass).frame }}
                className="w-7 h-7 flex-shrink-0 border object-cover select-none bg-[#141210]" />
              <span className="flex-1 min-w-0">
                <span className="block text-[11px] text-[#d8ccc0] truncate">{s.name}</span>
                <span className="block text-[9px] truncate" style={{ color: classTheme(s.charclass).frame }}>
                  {classNameOf(s.charclass)}
                </span>
              </span>
              {(blocked || needs) && (
                <span className={`text-[8px] font-cinzel tracking-wider uppercase flex-shrink-0 max-w-[45%] truncate px-1 py-px rounded-sm border ${
                  blocked ? 'border-[#7a2a18] bg-[#2a0c06] text-[#e08040]' : 'border-[#5a4a18] bg-[#221a06] text-[#c8a840]'
                }`}>
                  {blocked ? (blocked.startsWith('Only') ? `${classNameOf(s.charclass)} only` : 'Blocked') : needs}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
