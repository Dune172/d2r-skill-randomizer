import type { MutationContext } from './index';

const PRAYER_SKILL_NAME = 'prayer';
// Mode 0 = default standing/passive — activates aura continuously
const PRAYER_MODE = '0';
const PRAYER_LVL = '5';
const SKILL_SLOTS = 8;

export function applyBloodthirst(ctx: MutationContext): void {
  const { headers: sh, rows: sr } = ctx.skills;
  const skillNameCol = sh.indexOf('skill');
  if (skillNameCol === -1) return;

  // Find Prayer's row index in the (post-randomization) skills.txt
  const prayerRowIdx = sr.findIndex(r => r[skillNameCol]?.toLowerCase() === PRAYER_SKILL_NAME);
  if (prayerRowIdx === -1) return;
  const prayerRowId = String(prayerRowIdx);

  const { headers: mh, rows: mr } = ctx.monstats;

  // Locate Skill1..8 slot columns
  const skillCols: Array<{ skill: number; mode: number; lvl: number }> = [];
  for (let i = 1; i <= SKILL_SLOTS; i++) {
    const sIdx = mh.indexOf(`Skill${i}`);
    const mIdx = mh.indexOf(`Sk${i}mode`);
    const lIdx = mh.indexOf(`Sk${i}lvl`);
    if (sIdx !== -1 && mIdx !== -1 && lIdx !== -1) {
      skillCols.push({ skill: sIdx, mode: mIdx, lvl: lIdx });
    }
  }
  if (skillCols.length === 0) return;

  for (const row of mr) {
    // Skip rows with no Id (blank rows)
    if (!row[0]) continue;
    // Find first empty Skill slot
    const empty = skillCols.find(s => !row[s.skill]);
    if (!empty) continue;
    row[empty.skill] = prayerRowId;
    row[empty.mode] = PRAYER_MODE;
    row[empty.lvl] = PRAYER_LVL;
  }
}
