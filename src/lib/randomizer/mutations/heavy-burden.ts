import type { MutationContext } from './index';

const REQ_MULT = 1.5;
const DEF_MULT = 1.5;
const REQ_COLS = ['reqstr'];
const DEF_COLS = ['minac', 'maxac'];

const ARMOR_ITYPES = new Set([
  'armo', 'tors', 'helm', 'shld', 'glov', 'boot', 'belt',
  'ashd', 'phlm', 'pelt', 'head',
]);

const ANY_PROC_CODES = new Set([
  'hit-skill',     'hit-skill-noc',
  'att-skill',     'att-skill-noc',
  'gethit-skill',  'gethit-skill-noc',
  'kill-skill',    'kill-skill-noc',
  'death-skill',   'death-skill-noc',
  'levelup-skill', 'levelup-skill-noc',
  'charged',
]);

const PROC_CHANCE = 10;

/**
 * Inject a gethit-skill proc into every armor-applicable affix that doesn't
 * already have one. Called on raw (pre-remap) affix data so remapClassItemSkills
 * assigns the skill ID from the shuffled castable pool.
 */
export function injectArmorProcs(headers: string[], rows: string[][]): void {
  const itypeIdxs = ['itype1','itype2','itype3','itype4','itype5','itype6','itype7']
    .map(c => headers.indexOf(c)).filter(i => i !== -1);
  const levelIdx = headers.indexOf('level');

  type ModSlot = { code: number; min: number; max: number; param: number };
  const modSlots: ModSlot[] = [1, 2, 3].map(slot => ({
    code:  headers.indexOf(`mod${slot}code`),
    min:   headers.indexOf(`mod${slot}min`),
    max:   headers.indexOf(`mod${slot}max`),
    param: headers.indexOf(`mod${slot}param`),
  })).filter(s => s.code !== -1 && s.min !== -1 && s.max !== -1);

  for (const row of rows) {
    if (!itypeIdxs.some(i => ARMOR_ITYPES.has(row[i] ?? ''))) continue;
    if (modSlots.some(s => ANY_PROC_CODES.has(row[s.code] ?? ''))) continue;
    const free = modSlots.find(s => !row[s.code]?.trim());
    if (!free) continue;
    const affixLevel = levelIdx !== -1 ? (parseInt(row[levelIdx], 10) || 1) : 1;
    const skillLevel = Math.min(20, Math.max(1, Math.floor(affixLevel / 7)));
    row[free.code] = 'gethit-skill';
    row[free.min]  = String(PROC_CHANCE);
    row[free.max]  = String(skillLevel);
    if (free.param !== -1) row[free.param] = '0';
  }
}

export function applyHeavyBurden(ctx: MutationContext): void {
  const { headers: ah, rows: ar } = ctx.armor;

  const reqIdxs = REQ_COLS.map(c => ah.indexOf(c)).filter(i => i !== -1);
  const defIdxs = DEF_COLS.map(c => ah.indexOf(c)).filter(i => i !== -1);

  for (const row of ar) {
    // Only buff defense on armor that has a strength requirement
    const hasReq = reqIdxs.some(idx => parseInt(row[idx], 10) > 0);

    for (const idx of reqIdxs) {
      const val = parseInt(row[idx], 10);
      if (!isNaN(val) && val > 0) row[idx] = String(Math.ceil(val * REQ_MULT));
    }
    if (hasReq) {
      for (const idx of defIdxs) {
        const val = parseInt(row[idx], 10);
        if (!isNaN(val) && val > 0) row[idx] = String(Math.round(val * DEF_MULT));
      }
    }
  }

}
