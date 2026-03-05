/**
 * Modify uniqueitems.txt rows:
 *  - Disable "Bane Ash" (the only vanilla sst unique) so it doesn't conflict
 *  - Append a new "Teleport Staff" unique entry with 20× Teleport charges (level 1)
 * Returns a new rows array (does not mutate the original).
 */
export function applyTeleportStaffUnique(headers: string[], rows: string[][], reqLevel = 1): string[][] {
  const indexCol    = headers.indexOf('index');
  const disabledCol = headers.indexOf('disabled');
  const codeCol     = headers.indexOf('code');

  // Disable Bane Ash (the sst unique) to avoid random selection
  const updated = rows.map(row => {
    if (indexCol !== -1 && row[indexCol] === 'Bane Ash' && disabledCol !== -1) {
      const copy = [...row];
      copy[disabledCol] = '1';
      return copy;
    }
    return row;
  });

  // Build the new "Teleport Staff" row — fill all columns with empty, then set specific fields
  const newRow = new Array(headers.length).fill('');
  const set = (name: string, val: string) => {
    const i = headers.indexOf(name);
    if (i !== -1) newRow[i] = val;
  };

  set('index',    'Astral Wayfarer');
  set('version',  '0');
  set('disabled', '0');
  set('spawnable','1');
  set('code',     'sst');
  set('lvl',      '1');
  set('lvl req',  String(reqLevel));
  set('rarity',   '1');
  set('prop1',    'charged');
  set('par1',     '54');   // Teleport skill ID
  set('min1',     '20');   // 20 charges
  set('max1',     '1');    // charge level 1
  set('cost mult', '1');        // must be non-zero for cost_add to be applied
  set('cost add',  '81920000'); // effective_cost ≈ 81920168 → ~500 gold/charge recharge
  // → recharge ≈ floor(81920168 / 1024 / 20 × 0.125) × 20 ≈ 10,000 gold total

  return [...updated, newRow];
}

/**
 * Give the Astral Wayfarer as a guaranteed Blood Raven quest drop instead of
 * as a starting item, so it gets proper item value (not the 1-gold starting-item bug).
 *
 * - Appends TC "TC_AstralWayfarer" to treasureclassex.txt: 1 pick, 100% unique, sst
 * - Sets Blood Raven's TreasureClassQuest column in monstats.txt to "TC_AstralWayfarer"
 *
 * Mutates both row arrays in-place.
 */
export function applyBloodRavenQuestDrop(
  monstatsHeaders: string[],
  monstatsRows: string[][],
  tcHeaders: string[],
  tcRows: string[][]
): void {
  // 1. Append TC_AstralWayfarer to treasureclassex.txt
  const tcRow = new Array(tcHeaders.length).fill('');
  const setTc = (col: string, val: string) => {
    const i = tcHeaders.indexOf(col);
    if (i !== -1) tcRow[i] = val;
  };
  setTc('Treasure Class', 'TC_AstralWayfarer');
  setTc('Picks',  '1');
  setTc('Unique', '1024');  // 100% unique quality
  setTc('NoDrop', '0');
  setTc('Item1',  'sst');
  setTc('Prob1',  '1');
  tcRows.push(tcRow);

  // 2. Set Blood Raven's TreasureClassQuest to TC_AstralWayfarer
  const idCol    = monstatsHeaders.indexOf('Id');
  const questCol = monstatsHeaders.indexOf('TreasureClassQuest');
  if (idCol === -1 || questCol === -1) return;
  const bloodRaven = monstatsRows.find(r => r[idCol] === 'bloodraven');
  if (bloodRaven) bloodRaven[questCol] = 'TC_AstralWayfarer';
}
