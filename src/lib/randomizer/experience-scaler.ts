import { ACT_RE, BOSS_ACTS, EXP_COLS, TC_COL } from '@/lib/randomizer/players-scaler';

/**
 * Scale monster XP by multiplier for monsters belonging to the specified acts.
 * Operates on already-loaded monstats rows (e.g. after players scaling).
 * Only the Exp/Exp(N)/Exp(H) columns are modified — not HP or damage.
 */
export function scaleExperienceRows(
  headers: string[],
  rows: string[][],
  multiplier: number,
  acts: number[],
  skipIds: Set<string> = new Set(),
): string[][] {
  const tcIdx = headers.indexOf(TC_COL);
  const actsSet = new Set(acts);

  return rows.map(row => {
    const id = row[0];
    if (skipIds.has(id)) return row;
    let monsterAct: number | null = null;
    if (tcIdx !== -1) {
      const tc = row[tcIdx] ?? '';
      const m = tc.match(ACT_RE);
      monsterAct = m ? parseInt(m[1]) : (BOSS_ACTS[id] ?? null);
    }
    if (monsterAct === null || !actsSet.has(monsterAct)) return row;

    const scaled = [...row];
    for (const col of EXP_COLS) {
      const idx = headers.indexOf(col);
      if (idx === -1) continue;
      const val = parseInt(scaled[idx], 10);
      if (!isNaN(val) && val > 0) {
        scaled[idx] = String(Math.round(val * multiplier));
      }
    }
    return scaled;
  });
}
