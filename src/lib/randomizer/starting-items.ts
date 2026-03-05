import { CLASS_DEFS } from './config';

/**
 * Add a Short Staff (sst) to the first empty item slot (item6) of every class
 * in charstats.txt, placed in inventory with unique quality (6).
 * Modifies rows in-place.
 */
export function applyTeleportStaff(headers: string[], rows: string[][]): void {
  // Find the first empty item slot across all class rows (item1–item10)
  // In practice item6 is always free, but we scan to be safe
  let slotNum = -1;
  for (let n = 1; n <= 10; n++) {
    const col = headers.indexOf(`item${n}`);
    if (col === -1) continue;
    // Check if this slot is empty for ALL class rows
    const classCol = headers.indexOf('class');
    const allEmpty = rows
      .filter(r => classCol !== -1 && CLASS_DEFS.some(d => d.name === r[classCol]))
      .every(r => !r[col] || r[col] === '' || r[col] === '0');
    if (allEmpty) {
      slotNum = n;
      break;
    }
  }
  if (slotNum === -1) return; // No free slot found

  const itemCol = headers.indexOf(`item${slotNum}`);
  const locCol  = headers.indexOf(`item${slotNum}loc`);
  const cntCol  = headers.indexOf(`item${slotNum}count`);
  const qualCol = headers.indexOf(`item${slotNum}quality`);
  if (itemCol === -1) return;

  const classCol = headers.indexOf('class');
  for (const row of rows) {
    if (classCol !== -1 && !CLASS_DEFS.some(d => d.name === row[classCol])) continue;
    row[itemCol] = 'sst';
    if (locCol  !== -1) row[locCol]  = '';  // empty = inventory
    if (cntCol  !== -1) row[cntCol]  = '1';
    if (qualCol !== -1) row[qualCol] = '7'; // 7 = unique quality (D2 EITEMQUALITY enum)
  }
}

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
 * Set Teleport's recharge-cost columns in skills.txt so the charged staff
 * costs meaningful gold to refill at a vendor.
 * Only called when the Teleport Staff starting-item option is enabled.
 */
export function applyTeleportSkillCost(headers: string[], rows: string[][]): void {
  const skillCol = headers.indexOf('skill');
  const costMult = headers.indexOf('cost mult');
  const costAdd  = headers.indexOf('cost add');
  if (skillCol === -1 || costMult === -1 || costAdd === -1) return;

  const row = rows.find(r => r[skillCol] === 'Teleport');
  if (!row) return;

  row[costMult] = '10240000';  // floor(10240000 × 1 / 1024 / 20) = 500 gold/charge
  row[costAdd]  = '0';         // → 10,000 gold to fully refill 20 charges
}
