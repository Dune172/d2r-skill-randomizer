/** Format a duration in seconds as e.g. "5h 23m 45s" — leading zero units are dropped. */
export function formatHMS(totalSeconds: number): string {
  const t = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h}h`);
  if (h > 0 || m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ');
}

export function parseHMS(parts: { h?: number | string; m?: number | string; s?: number | string }): number {
  const h = Number(parts.h ?? 0) || 0;
  const m = Number(parts.m ?? 0) || 0;
  const s = Number(parts.s ?? 0) || 0;
  return Math.floor(h) * 3600 + Math.floor(m) * 60 + Math.floor(s);
}

export const MAX_RUN_SECONDS = 7 * 24 * 60 * 60; // one week
// 30-minute floor — fastest known Baal Normal runs sit comfortably above this.
// Anything under is almost certainly a typo or spam.
export const MIN_RUN_SECONDS = 30 * 60;
