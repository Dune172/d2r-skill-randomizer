import type { MutationContext } from './index';

// Skill name as it appears in skills.txt — monstats Skill columns take names, not indices
const AMPLIFY_SKILL_NAME = 'amplifydamage';
const AMPLIFY_MODE = '0';
const AMPLIFY_LVL = '10';
const SKILL_SLOTS = 8;

export function applyCursedGround(ctx: MutationContext): void {
  const { headers: mh, rows: mr } = ctx.monstats;

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
    if (!row[0]) continue;
    const empty = skillCols.find(s => !row[s.skill]);
    if (!empty) continue;
    row[empty.skill] = AMPLIFY_SKILL_NAME;
    row[empty.mode] = AMPLIFY_MODE;
    row[empty.lvl] = AMPLIFY_LVL;
  }
}
