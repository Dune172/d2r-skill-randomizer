import { monsterAct, EXP_COLS, TC_COL } from './players-scaler';

/**
 * Scale monster XP by multiplier for monsters belonging to the specified acts.
 * Operates on already-loaded monstats rows (e.g. after players scaling).
 * Only the Exp/Exp(N)/Exp(H) columns are modified — not HP or damage.
 *
 * `difficulties` selects which difficulty columns are scaled (1=Normal→Exp,
 * 2=Nightmare→Exp(N), 3=Hell→Exp(H)). Difficulty selection is orthogonal to act
 * filtering: a monster must be in an enabled act, and only its enabled-difficulty
 * columns are scaled.
 */
export function scaleExperienceRows(
  headers: string[],
  rows: string[][],
  multiplier: number,
  acts: number[],
  difficulties: number[] = [1, 2, 3],
  skipIds: Set<string> = new Set(),
  destinationActs?: ReadonlyMap<string, number>,
): string[][] {
  const tcIdx = headers.indexOf(TC_COL);
  const actsSet = new Set(acts);
  const cols = difficulties.map(d => EXP_COLS[d - 1]).filter(Boolean);

  return rows.map(row => {
    const id = row[0];
    if (skipIds.has(id)) return row;
    const act = monsterAct(id, tcIdx !== -1 ? row[tcIdx] ?? '' : '', destinationActs);
    if (act === null || !actsSet.has(act)) return row;

    const scaled = [...row];
    for (const col of cols) {
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
