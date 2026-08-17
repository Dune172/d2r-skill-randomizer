'use client';

import { classTheme } from '@/lib/ui/class-theme';
import { skillIconSrc, SKILL_ICON_TILE } from '@/lib/ui/skill-icons';

export interface PreviewSkill {
  name: string;
  desc: string;
  originalClass: string;
  iconClass: string;
  iconCel: number;
  row: number;
  col: number;
}

interface SkillIconCellProps {
  /** null renders an empty tree slot. */
  skill: PreviewSkill | null;
  /** Horizontal anchor, precomputed from the cell's position in the card. */
  align: 'left' | 'center' | 'right';
  /** Top-row cells open downward so the tooltip can't escape the card. */
  below: boolean;
  /** Tap-pinned open state, owned by the card so only one shows at a time. */
  open: boolean;
  onToggle: () => void;
  tipId: string;
}

const ALIGN_CLASS = {
  left: 'left-0',
  center: 'left-1/2 -translate-x-1/2',
  right: 'right-0',
} as const;

export default function SkillIconCell({ skill, align, below, open, onToggle, tipId }: SkillIconCellProps) {
  // Empty slot — a dark recess, matching the game's unfilled tree positions.
  if (!skill) {
    return (
      <div
        aria-hidden="true"
        className="aspect-square bg-[#121110] border border-[#2a2724] shadow-[inset_0_1px_3px_rgba(0,0,0,0.6)]"
      />
    );
  }

  const theme = classTheme(skill.originalClass);

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={skill.name}
      aria-describedby={tipId}
      style={{ '--frame': theme.frame, '--frame-glow': theme.glow } as React.CSSProperties}
      className="group relative block w-full aspect-square cursor-help
        border-2 border-[color:var(--frame)]/60 bg-[#141210]
        shadow-[inset_0_0_0_1px_rgba(0,0,0,0.85)]
        hover:border-[color:var(--frame)]
        hover:shadow-[0_0_12px_var(--frame-glow),inset_0_0_0_1px_rgba(0,0,0,0.85)]
        focus:outline-none focus-visible:border-[#c8942a]
        transition-[border-color,box-shadow] duration-150"
    >
      {/* The tiles carry the game's own riveted stone frame, so the class tint
          reads as an outer rim around it rather than replacing it. */}
      <img
        src={skillIconSrc(skill.iconClass, skill.iconCel)}
        alt=""
        width={SKILL_ICON_TILE}
        height={SKILL_ICON_TILE}
        loading="lazy"
        decoding="async"
        draggable={false}
        className="w-full h-full object-cover select-none"
      />

      {/* In-game skill tooltip: name and description only. CSS-driven on
          hover/focus (as HomeMutationCard), with `open` covering touch. */}
      <span
        role="tooltip"
        id={tipId}
        className={`pointer-events-none absolute z-30 ${below ? 'top-full mt-1.5' : 'bottom-full mb-1.5'} ${ALIGN_CLASS[align]}
          w-44 sm:w-56 max-w-[calc(100vw-2rem)]
          border border-[#c8942a]/45 bg-[#0c0304]/[0.97] px-3 py-2 text-center
          shadow-[0_0_20px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(200,148,42,0.10)]
          transition-opacity duration-100
          ${open ? 'visible opacity-100' : 'invisible opacity-0'}
          group-hover:visible group-hover:opacity-100
          group-focus-within:visible group-focus-within:opacity-100`}
      >
        <span className="block font-cinzel font-bold text-[11px] tracking-[0.12em] uppercase text-[#e8c87a]">
          {skill.name}
        </span>
        {skill.desc && (
          <>
            <span className="block my-1.5 h-px bg-gradient-to-r from-transparent via-[#7a5818] to-transparent" />
            {/* whitespace-pre-line renders the description's embedded newline as
                the same line break the game shows. */}
            <span className="block font-sans text-[11px] leading-snug text-[#a89060] whitespace-pre-line">
              {skill.desc}
            </span>
          </>
        )}
      </span>
    </button>
  );
}
