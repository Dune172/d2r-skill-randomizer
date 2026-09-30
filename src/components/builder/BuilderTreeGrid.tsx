'use client';

import type { CatalogPage, CatalogSkill } from '@/lib/builder/catalog';
import { classNameOf, slotKey } from '@/lib/builder/class-build';
import { classTheme } from '@/lib/ui/class-theme';
import { skillIconSrc, SKILL_ICON_TILE } from '@/lib/ui/skill-icons';

// Grid row → required character level. Matches ROW_TO_LEVEL in
// src/lib/randomizer/skills-writer.ts: reqlevel is rewritten FROM the row, so a
// level-30 skill dropped into row 1 becomes a level-1 skill by design.
export const REQ_LEVEL = [1, 6, 12, 18, 24, 30];

/** Drag payload shared by the palette and the grid. `from` is set when dragging out of a slot. */
export const DRAG_TYPE = 'application/x-d2rr-skill';
export interface DragPayload { skill: string; from?: string }

export function readDrag(e: React.DragEvent): DragPayload | null {
  try {
    const raw = e.dataTransfer.getData(DRAG_TYPE);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

interface BuilderTreeGridProps {
  tabIndex: number;
  /** Screen position, 1 = leftmost. The game shows SkillPage 3 on the left. */
  screenTab: number;
  page: CatalogPage;
  slots: Record<string, string>;
  skillByName: Map<string, CatalogSkill>;
  selectedKey?: string | null;
  /** slot key → worst issue on it. */
  issues?: Map<string, { severity: 'error' | 'warning'; message: string }>;
  onSlotClick?: (key: string) => void;
  onRemove?: (key: string) => void;
  onDrop?: (key: string, payload: DragPayload) => void;
}

export default function BuilderTreeGrid({
  tabIndex, screenTab, page, slots, skillByName, selectedKey, issues,
  onSlotClick, onRemove, onDrop,
}: BuilderTreeGridProps) {
  const filled = new Set(page.slots.filter(s => s.status === 'FILLED').map(s => `${s.row}-${s.col}`));

  return (
    <div className="w-full max-w-[222px] mx-auto">
      <div className="mb-1.5 text-center">
        <div className="font-cinzel text-[10px] tracking-[0.2em] uppercase text-[#c8942a]">Tab {screenTab}</div>
        <div className="text-[10px] text-[#8a7a5a] truncate" title={`${classNameOf(page.classCode)} — ${page.label}`}>
          {classNameOf(page.classCode)} · {page.label}
        </div>
      </div>
      <div className="p-1.5 bg-[#2b2825] border border-[#3d3833] grid grid-cols-3 gap-[3px]">
        {Array.from({ length: 18 }, (_, i) => {
          const row = Math.floor(i / 3) + 1;
          const col = (i % 3) + 1;

          // No socket on this page: can never hold a skill.
          if (!filled.has(`${row}-${col}`)) {
            return (
              <div key={i} aria-hidden="true"
                className="aspect-square bg-[#121110] border border-[#2a2724] shadow-[inset_0_1px_3px_rgba(0,0,0,0.6)]" />
            );
          }

          const key = slotKey(tabIndex, row, col);
          const skill = slots[key] ? skillByName.get(slots[key]) : undefined;
          const selected = selectedKey === key;
          const issue = issues?.get(key);
          const theme = skill ? classTheme(skill.iconClass) : null;
          // Selection and problems outrank the source-class tint: they are what
          // the player needs to act on.
          const frame = selected ? '#f0c040'
            : issue?.severity === 'error' ? '#e04020'
              : issue ? '#c48020'
                : theme?.frame ?? '#4a3a20';

          const label = skill
            ? `${skill.name} (${classNameOf(skill.charclass)}) — Req. level ${REQ_LEVEL[row - 1]}`
            : `Empty — Req. level ${REQ_LEVEL[row - 1]}`;

          return (
            <div key={i} className="relative group aspect-square">
              <button
                type="button"
                onClick={() => onSlotClick?.(key)}
                draggable={!!skill}
                onDragStart={e => {
                  if (!skill) return;
                  e.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ skill: skill.skill, from: key } satisfies DragPayload));
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onDragOver={e => { if (e.dataTransfer.types.includes(DRAG_TYPE)) e.preventDefault(); }}
                onDrop={e => {
                  const payload = readDrag(e);
                  if (!payload) return;
                  e.preventDefault();
                  onDrop?.(key, payload);
                }}
                aria-label={`${label}, tab ${screenTab} row ${row} column ${col}${selected ? ', selected' : ''}`}
                aria-pressed={selected}
                title={issue ? `${label}\n\n⚠ ${issue.message}` : label}
                style={{ '--frame': frame, '--frame-glow': theme?.glow ?? 'rgba(200,148,42,0.3)' } as React.CSSProperties}
                className={`block w-full h-full border-2 border-[color:var(--frame)] bg-[#141210]
                  shadow-[inset_0_0_0_1px_rgba(0,0,0,0.85)]
                  hover:shadow-[0_0_12px_var(--frame-glow),inset_0_0_0_1px_rgba(0,0,0,0.85)]
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c8942a]
                  transition-[border-color,box-shadow] duration-150
                  ${selected ? 'ring-2 ring-[#f0c040]/60' : ''} ${skill ? 'cursor-grab' : 'border-dashed'}`}
              >
                {skill ? (
                  <img src={skillIconSrc(skill.iconClass, skill.iconCel)} alt="" width={SKILL_ICON_TILE}
                    height={SKILL_ICON_TILE} loading="lazy" decoding="async" draggable={false}
                    className="w-full h-full object-cover select-none pointer-events-none" />
                ) : (
                  <span className="absolute inset-0 flex items-center justify-center text-[9px] text-[#6a5a3a] font-cinzel tracking-wider pointer-events-none">
                    Lv {REQ_LEVEL[row - 1]}
                  </span>
                )}
                {issue && (
                  <span aria-hidden="true"
                    className={`absolute bottom-0 left-0 px-0.5 text-[10px] leading-none bg-[#0c0304]/85 ${issue.severity === 'error' ? 'text-[#e04020]' : 'text-[#c48020]'}`}>
                    ⚠
                  </span>
                )}
              </button>
              {skill && (
                <button
                  type="button"
                  onClick={() => onRemove?.(key)}
                  aria-label={`Remove ${skill.name}`}
                  title="Remove"
                  className={`absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full border border-[#7a3020] bg-[#1a0606] text-[#e08080] text-[12px] leading-none
                    flex items-center justify-center hover:bg-[#3a0808] focus:opacity-100 transition-opacity
                    ${selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                >
                  ×
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
