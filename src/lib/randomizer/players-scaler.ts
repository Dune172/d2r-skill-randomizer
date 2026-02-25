// Column names as they appear in monstats.txt (mixed case)
const HP_COLS = ['minHP', 'maxHP', 'MinHP(N)', 'MaxHP(N)', 'MinHP(H)', 'MaxHP(H)'];
const EXP_COLS = ['Exp', 'Exp(N)', 'Exp(H)'];

/**
 * Scale monster HP and experience to simulate the effect of /players N.
 * Formula: multiplier = 1 + (playerCount - 1) * 0.5
 * (matches D2 engine: 1p→1×, 2p→1.5×, 4p→2.5×, 8p→4.5×)
 * Monster damage is intentionally NOT scaled — only HP and Exp.
 */
export function scaleMonstats(
  headers: string[],
  rows: string[][],
  playerCount: number,
): string[][] {
  const multiplier = 1 + (playerCount - 1) * 0.5;
  const colsToScale = [...HP_COLS, ...EXP_COLS];

  return rows.map(row => {
    const scaled = [...row];
    for (const col of colsToScale) {
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
