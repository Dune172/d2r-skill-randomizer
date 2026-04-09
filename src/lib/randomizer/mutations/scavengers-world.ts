import type { MutationContext } from './index';

export function applyScavengersWorld(ctx: MutationContext): void {
  const { headers: th, rows: tr } = ctx.treasureclass;
  const uniqueIdx = th.indexOf('Unique');
  const setIdx    = th.indexOf('Set');
  const rareIdx   = th.indexOf('Rare');
  const magicIdx  = th.indexOf('Magic');
  if (uniqueIdx === -1 || setIdx === -1 || rareIdx === -1 || magicIdx === -1) return;

  for (const row of tr) {
    const unique = parseInt(row[uniqueIdx], 10) || 0;
    const set    = parseInt(row[setIdx],    10) || 0;
    const rare   = parseInt(row[rareIdx],   10) || 0;

    if (unique === 0 && set === 0 && rare === 0) continue;

    // Halve Unique, Set, and Rare weights; shift the removed weight to Magic
    const newUnique = Math.floor(unique / 2);
    const newSet    = Math.floor(set / 2);
    const newRare   = Math.floor(rare / 2);
    const shifted   = (unique - newUnique) + (set - newSet) + (rare - newRare);

    row[uniqueIdx] = String(newUnique);
    row[setIdx]    = String(newSet);
    row[rareIdx]   = String(newRare);

    const magic = parseInt(row[magicIdx], 10) || 0;
    row[magicIdx] = String(magic + shifted);
  }
}
