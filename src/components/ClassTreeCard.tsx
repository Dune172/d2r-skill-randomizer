'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { classTheme } from '@/lib/ui/class-theme';
import SkillIconCell, { PreviewSkill } from './SkillIconCell';

interface Tab {
  sourceClass: string;
  sourceTree: number;
  skills: PreviewSkill[];
}

interface ClassTreeCardProps {
  code: string;
  name: string;
  tabs: Tab[];
  /** Mystery Box is active — skills arrive pre-masked from the server. */
  masked: boolean;
  /** Owned by SkillTreePreview: the two cards sharing a grid row open and close
   *  together, so a row is never half height. */
  expanded: boolean;
  onToggleExpanded: () => void;
}

const ROWS = 6;
const COLS = 3;

/** One tree: the 6x3 grid of skill slots. */
function SkillTreeGrid({
  tab,
  treeIdx,
  openId,
  setOpenId,
}: {
  tab: Tab;
  treeIdx: number;
  openId: string | null;
  setOpenId: (id: string | null) => void;
}) {
  // One pass over the tab's skills instead of an 18-cell linear scan.
  const byCell = useMemo(() => {
    const map = new Map<string, PreviewSkill>();
    for (const skill of tab.skills) map.set(`${skill.row}-${skill.col}`, skill);
    return map;
  }, [tab]);

  return (
    <div className="grid grid-cols-3 gap-[3px]">
      {Array.from({ length: ROWS * COLS }, (_, i) => {
        const row = Math.floor(i / COLS) + 1;
        const col = (i % COLS) + 1;
        const skill = byCell.get(`${row}-${col}`) ?? null;
        const id = `${treeIdx}-${row}-${col}`;

        // Anchor edge tooltips inward so they can't clip out of the viewport.
        // Derived from position rather than measured — there are 144 cells a card.
        const align = treeIdx === 0 && col === 1
          ? 'left'
          : treeIdx === 2 && col === COLS
            ? 'right'
            : 'center';

        return (
          <SkillIconCell
            key={i}
            skill={skill}
            align={align}
            below={row === 1}
            open={openId === id}
            onToggle={() => setOpenId(openId === id ? null : id)}
            tipId={`tip-${id}`}
          />
        );
      })}
    </div>
  );
}

export default function ClassTreeCard({
  code, name, tabs, masked, expanded, onToggleExpanded,
}: ClassTreeCardProps) {
  const theme = classTheme(masked ? '?' : code);
  const cardRef = useRef<HTMLDivElement>(null);
  // Tap-to-pin, one tooltip at a time — hover alone is useless on touch, and an
  // inline description under every one of 144 cells would not be a skill tree.
  const [openId, setOpenId] = useState<string | null>(null);
  const panelId = `spoiler-trees-${code}`;

  // Drop any pinned tooltip when the card closes, so re-opening it doesn't
  // restore a tooltip the reader didn't ask for.
  useEffect(() => {
    if (!expanded) setOpenId(null);
  }, [expanded]);

  useEffect(() => {
    if (openId === null) return;
    const dismissOutside = (e: Event) => {
      if (!cardRef.current?.contains(e.target as Node)) setOpenId(null);
    };
    const dismissEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenId(null);
    };
    document.addEventListener('mousedown', dismissOutside);
    document.addEventListener('touchstart', dismissOutside);
    document.addEventListener('keydown', dismissEscape);
    return () => {
      document.removeEventListener('mousedown', dismissOutside);
      document.removeEventListener('touchstart', dismissOutside);
      document.removeEventListener('keydown', dismissEscape);
    };
  }, [openId]);

  // `tabs` arrives in SkillPage order (1, 2, 3), which is the reverse of how the
  // game lays the tabs out on screen. Render screen order so this card's "Random 1"
  // is the same tab the game labels "Random 1".
  const tabsInScreenOrder = [...tabs].reverse();

  return (
    <div
      ref={cardRef}
      className="card-ornate border border-t-2 border-[#3a1510] border-t-[#c8942a]/30
        bg-[#0c0304] panel-shadow"
    >
      {/* Class header — the collapse toggle for this card */}
      <button
        type="button"
        onClick={onToggleExpanded}
        aria-expanded={expanded}
        aria-controls={panelId}
        className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left
          ${theme.headerBg} ${expanded ? 'border-b border-[#3a1510]' : ''}
          hover:brightness-[1.35] focus:outline-none focus-visible:ring-1 focus-visible:ring-[#c8942a]
          transition-[filter] duration-150 cursor-pointer`}
      >
        <h3 className={`font-cinzel font-bold text-sm tracking-[0.18em] uppercase ${theme.headerText}`}>
          {name}
        </h3>
        <span className="flex items-center gap-2.5 flex-shrink-0">
          <span className="font-cinzel text-[9px] tracking-[0.18em] uppercase text-[#8a807a] hidden sm:inline">
            {expanded ? 'Hide' : 'Show trees'}
          </span>
          <span
            aria-hidden="true"
            className={`text-[16px] leading-none ${theme.headerText} transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
          >
            ▾
          </span>
        </span>
      </button>

      {/* Dark stone well holding the three trees — mimics the in-game skill window */}
      {expanded && (
        <div id={panelId} className="p-3 bg-[#171513] shadow-[inset_0_2px_10px_rgba(0,0,0,0.7)]">
          {/* Wider gap only from xl, where there's width to spare — at lg the three
              plates share ~440px and every extra gap pixel comes off the icons. */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-3 xl:gap-4">
            {tabsInScreenOrder.map((tab, treeIdx) => (
              // Each tree sits on its own lighter plate so the three read as
              // separate trees rather than one nine-wide grid. Capped and centred
              // so the single-column layout shows tidy icons instead of stretched
              // ones — the cap covers the plate, hence 210px of grid + 12px padding.
              <div
                key={treeIdx}
                className="w-full max-w-[222px] mx-auto p-1.5
                  bg-[#2b2825] border border-[#3d3833]
                  shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
              >
                <div className="mb-1.5 px-0.5 font-cinzel text-[9px] tracking-[0.15em] uppercase text-[#a39a94] truncate">
                  Random {treeIdx + 1}
                  {!masked && <span className="text-[#7a716a]"> · {tab.sourceClass} / Tree {tab.sourceTree}</span>}
                </div>
                <SkillTreeGrid tab={tab} treeIdx={treeIdx} openId={openId} setOpenId={setOpenId} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
