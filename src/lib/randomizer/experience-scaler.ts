import { loadTxtFile, serializeTxtFile } from '@/lib/data-loader';

/**
 * Scale experience thresholds by dividing all class XP columns by multiplier.
 * Columns between 'Level' and 'ExpRatio' are per-class XP thresholds.
 * The MaxLvl row is skipped.
 */
export function scaleExperience(multiplier: number): string {
  const { headers, rows } = loadTxtFile('experience.txt');
  const levelCol    = headers.indexOf('Level');
  const expRatioCol = headers.indexOf('ExpRatio');
  for (const row of rows) {
    if (row[levelCol] === 'MaxLvl') continue;
    for (let col = levelCol + 1; col < expRatioCol; col++) {
      const val = Number(row[col]);
      if (val > 0) row[col] = String(Math.floor(val / multiplier));
    }
  }
  return serializeTxtFile(headers, rows);
}
