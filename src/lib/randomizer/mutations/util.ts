/**
 * Shared helpers for mutation modules.
 */

/**
 * Numeric txt columns are integer fields. D2R's data-table reader accumulates
 * digits without validating them (`val = val * 10 + (c - '0')`), so a cell
 * written as "87.5" is read as 8685 rather than 87 or 88 — the '.' contributes
 * -2 and every later digit shifts the value another decade. Any mutation that
 * scales a cell must therefore round before stringifying.
 *
 * Scales row[idx] by mult and writes it back as an integer. No-ops on blank,
 * non-numeric, or zero cells.
 */
export function scaleIntCell(row: string[], idx: number, mult: number): void {
  if (idx < 0 || idx >= row.length) return;
  const val = parseFloat(row[idx]);
  if (isNaN(val) || val === 0) return;
  row[idx] = String(Math.round(val * mult));
}

/**
 * Assert no mutation wrote a decimal into a numeric txt column. Engine-read
 * columns in vanilla txt data contain no bare decimal cells, so any match is a
 * mutation bug that would otherwise ship as a wildly wrong in-game value (see
 * scaleIntCell).
 *
 * `*`-prefixed headers are comment columns the engine never parses, and some do
 * legitimately hold decimals (treasureclassex.txt's *TreasureClassDropChance
 * carries 101 of them), so they're skipped.
 *
 * Throws in development so the bug surfaces during testing; in production it
 * logs and repairs the cell so a bad mod is never handed to a player.
 */
export function assertNoFractionalCells(
  fileName: string,
  headers: string[],
  rows: string[][],
): void {
  const DECIMAL = /^-?\d+\.\d+$/;
  const offenders: string[] = [];

  for (const row of rows) {
    for (let col = 0; col < row.length; col++) {
      if (headers[col]?.startsWith('*')) continue;
      if (!DECIMAL.test(row[col])) continue;
      offenders.push(`${fileName} [${row[0]}] ${headers[col] ?? `col ${col}`} = "${row[col]}"`);
      row[col] = String(Math.round(parseFloat(row[col])));
    }
  }

  if (offenders.length === 0) return;

  const msg =
    `Mutation wrote ${offenders.length} fractional cell(s) into an integer ` +
    `txt column:\n  ${offenders.slice(0, 20).join('\n  ')}` +
    (offenders.length > 20 ? `\n  …and ${offenders.length - 20} more` : '');

  if (process.env.NODE_ENV !== 'production') throw new Error(msg);
  console.error(msg + '\nCells were rounded to integers to keep the mod usable.');
}
