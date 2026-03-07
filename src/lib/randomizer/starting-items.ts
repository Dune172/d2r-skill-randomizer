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
  set('cost add',  '-10000'); // recharge cost calibration

  return [...updated, newRow];
}

/**
 * Give the Astral Wayfarer as a guaranteed Corpsefire drop on every kill.
 *
 * - Appends TC "TC_AstralWayfarer" to treasureclassex.txt: 1 pick, 100% Astral Wayfarer
 * - Sets Corpsefire's TC column in superuniques.txt to "TC_AstralWayfarer"
 *
 * Mutates both row arrays in-place.
 */
export function applyBloodRavenQuestDrop(
  suHeaders: string[],
  suRows: string[][],
  tcHeaders: string[],
  tcRows: string[][]
): void {
  // 1. Append TC_AstralWayfarer to treasureclassex.txt.
  // Reference the unique item by its UniqueItems index name so D2R drops
  // exactly that unique — no quality-roll flags needed.
  const tcRow = new Array(tcHeaders.length).fill('');
  const setTc = (col: string, val: string) => {
    const i = tcHeaders.indexOf(col);
    if (i !== -1) tcRow[i] = val;
  };
  setTc('Treasure Class', 'TC_AstralWayfarer');
  setTc('Picks', '1');
  setTc('NoDrop', '0');
  setTc('Item1', 'Astral Wayfarer');  // UniqueItems.txt index name → guaranteed drop
  setTc('Prob1', '1');
  tcRows.push(tcRow);

  // 2. Set Corpsefire's TC in superuniques.txt.
  const suCol = suHeaders.indexOf('Superunique');
  const tcCol = suHeaders.indexOf('TC');
  if (suCol === -1 || tcCol === -1) return;
  const corpsefire = suRows.find(r => r[suCol] === 'Corpsefire');
  if (!corpsefire) return;
  corpsefire[tcCol] = 'TC_AstralWayfarer';
  const tcNCol = suHeaders.indexOf('TC(N)');
  const tcHCol = suHeaders.indexOf('TC(H)');
  if (tcNCol !== -1) corpsefire[tcNCol] = 'TC_AstralWayfarer';
  if (tcHCol !== -1) corpsefire[tcHCol] = 'TC_AstralWayfarer';
}
