/**
 * Per-class accent colours for the spoiler skill trees — client-safe.
 *
 * Two consumers need these: the icon cell (which tints its frame with the
 * SOURCE class of the skill sitting in it) and the legend that explains what
 * those tints mean. `frame` / `glow` are raw hexes rather than Tailwind classes
 * because the value is data-driven per cell: they're fed through CSS custom
 * properties so the utility literals referencing them stay static, which is what
 * Tailwind v4's JIT scan needs.
 */

export interface ClassTheme {
  /** Short label for the legend. */
  label: string;
  /** Icon-cell rim colour, and the legend swatch. */
  frame: string;
  /** rgba() bloom behind a hovered cell. */
  glow: string;
  /** Card chrome — Tailwind classes. */
  headerBg: string;
  headerText: string;
}

// frame values follow the long-standing per-class text colours below, so the
// colour language is unchanged from the letter badges these replaced. Two
// exceptions: nec was #50b050 and dru was #c8a040, too close to ama and pal
// respectively to tell apart as a thin rim — nudged to teal and earthy brown now
// that the frame is the only provenance cue in the grid.
export const CLASS_THEME: Record<string, ClassTheme> = {
  ama: { label: 'Amazon',  frame: '#58c070', glow: 'rgba(88,192,112,0.35)',  headerBg: 'bg-[#071a09]', headerText: 'text-[#58c070]' },
  sor: { label: 'Sorc',    frame: '#5898e0', glow: 'rgba(88,152,224,0.35)',  headerBg: 'bg-[#060a1e]', headerText: 'text-[#5898e0]' },
  nec: { label: 'Necro',   frame: '#3fb08a', glow: 'rgba(63,176,138,0.35)',  headerBg: 'bg-[#050e08]', headerText: 'text-[#50b050]' },
  pal: { label: 'Paladin', frame: '#e8c050', glow: 'rgba(232,192,80,0.35)',  headerBg: 'bg-[#1a1406]', headerText: 'text-[#e8c050]' },
  bar: { label: 'Barb',    frame: '#e05858', glow: 'rgba(224,88,88,0.35)',   headerBg: 'bg-[#1c0606]', headerText: 'text-[#e05858]' },
  dru: { label: 'Druid',   frame: '#a87838', glow: 'rgba(168,120,56,0.35)',  headerBg: 'bg-[#150e04]', headerText: 'text-[#c8a040]' },
  ass: { label: 'Assassin',frame: '#b868e0', glow: 'rgba(184,104,224,0.35)', headerBg: 'bg-[#0e0614]', headerText: 'text-[#b868e0]' },
  war: { label: 'Warlock', frame: '#e88038', glow: 'rgba(232,128,56,0.35)',  headerBg: 'bg-[#1a0c04]', headerText: 'text-[#e88038]' },
};

/** Used for the masked (Mystery Box) case, where provenance is deliberately hidden. */
export const DEFAULT_THEME: ClassTheme = {
  label: '???', frame: '#6a625c', glow: 'rgba(120,112,104,0.25)',
  headerBg: 'bg-[#0e0808]', headerText: 'text-[#8a8078]',
};

export function classTheme(code: string): ClassTheme {
  return CLASS_THEME[code] ?? DEFAULT_THEME;
}

/** Legend order — matches CLASS_DEFS so it reads the same as the rest of the site. */
export const LEGEND_ORDER = ['ama', 'sor', 'nec', 'pal', 'bar', 'dru', 'ass', 'war'] as const;
