import type { MutationContext } from './index';

const POTION_CODES = new Set([
  'hp1', 'hp2', 'hp3', 'hp4', 'hp5',
  'mp1', 'mp2', 'mp3', 'mp4', 'mp5',
  'rvs', 'rvl',
]);

export function applyFamine(ctx: MutationContext): void {
  const { headers: th, rows: tr } = ctx.treasureclass;

  const itemIdxs: number[] = [];
  const probIdxs: number[] = [];
  for (let i = 1; i <= 10; i++) {
    const ii = th.indexOf(`Item${i}`);
    const pi = th.indexOf(`Prob${i}`);
    if (ii !== -1) itemIdxs.push(ii);
    if (pi !== -1) probIdxs.push(pi);
  }
  const noDropIdx = th.indexOf('NoDrop');

  for (const row of tr) {
    for (let i = 0; i < itemIdxs.length; i++) {
      const item = (row[itemIdxs[i]] ?? '').toLowerCase();
      if (!POTION_CODES.has(item)) continue;
      const removed = parseInt(row[probIdxs[i]] || '0', 10);
      row[itemIdxs[i]] = '';
      row[probIdxs[i]] = '';
      if (noDropIdx !== -1 && removed > 0) {
        const nd = parseInt(row[noDropIdx] || '0', 10);
        row[noDropIdx] = String(nd + removed);
      }
    }
  }
}
