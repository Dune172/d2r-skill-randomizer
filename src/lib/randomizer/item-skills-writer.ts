import { ClassCode, SkillPlacement } from './types';
import { isCastableTarget, isProcTarget } from './skill-filters';
import type { SeededRNG } from './seed';

// Sentinel proc param written by mutation proc-injectors (Heavy Burden's
// injectArmorProcs, Titan's Grip's injectWeaponProcs). When remapClassItemSkills
// sees a proc whose param is this sentinel, it assigns a RANDOM castable skill
// from the seeded pool instead of identity-remapping a vanilla reference.
export const INJECTED_PROC_PARAM = '-1';

// Walk the placement fallback chain (exact tab/row/col → same row+col, any tab →
// same row, any col/tab → any placement in class) and return the first castable
// target. Passive and aura skills are skipped because they have no ItemEffect /
// srvdofunc execution path and silently fail as CTC / charged proc targets.
function findCastableDestination(
  classRestriction: ClassCode | string,
  src: SkillPlacement,
  byPos: Map<string, SkillPlacement[]>,
  byClassRowCol: Map<string, SkillPlacement[]>,
  byClassRow: Map<string, SkillPlacement[]>,
  byClass: Map<string, SkillPlacement[]>,
): SkillPlacement | undefined {
  const tiers: (SkillPlacement[] | undefined)[] = [
    byPos.get(`${classRestriction}_${src.tabIndex}_${src.row}_${src.col}`),
    byClassRowCol.get(`${classRestriction}_${src.row}_${src.col}`),
    byClassRow.get(`${classRestriction}_${src.row}`),
    byClass.get(String(classRestriction)),
  ];
  for (const tier of tiers) {
    if (!tier) continue;
    const hit = tier.find(p => isCastableTarget(p.skill));
    if (hit) return hit;
  }
  return undefined;
}

// Proc codes (CTC family + charged). Vanilla proc references are identity-
// preserved through idMapping. Mutation-INJECTED procs (param === INJECTED_PROC_PARAM)
// are randomized from the seeded castable pool: on class-restricted items the pool
// is the restricted class's castable skills; on unrestricted items, all castables.
// `charged` is included because charges-based effects are also procs.
const PROC_CODES: ReadonlySet<string> = new Set([
  'hit-skill',     'hit-skill-noc',
  'att-skill',     'att-skill-noc',
  'gethit-skill',  'gethit-skill-noc',
  'kill-skill',    'kill-skill-noc',
  'death-skill',   'death-skill-noc',
  'levelup-skill', 'levelup-skill-noc',
  'charged',
]);

// `oskill` is a cross-class GRANTER ("+N to <skill>"), not a proc. Vanilla
// legitimately points it at passives (e.g. Stealskull's "+N to Critical
// Strike"). Identity-preserve via idMapping — same row remap as monstats.
const GRANTER_ROWINDEX_CODES: ReadonlySet<string> = new Set(['oskill']);

// Translate a numeric skill row-index reference through idMapping. Returns
// the input string unchanged if it isn't numeric, isn't in idMapping, or
// idMapping is unset.
function remapRowIndexParam(par: string, idMapping?: Map<number, number>): string {
  if (!idMapping) return par;
  const id = parseInt(par.trim(), 10);
  if (isNaN(id)) return par;
  const mapped = idMapping.get(id);
  return mapped !== undefined ? String(mapped) : par;
}


function buildPlacementIndices(placements: SkillPlacement[]) {
  const byPos = new Map<string, SkillPlacement[]>();
  const byClassRowCol = new Map<string, SkillPlacement[]>();
  const byClassRow = new Map<string, SkillPlacement[]>();
  const byClass = new Map<string, SkillPlacement[]>();
  for (const p of placements) {
    const posKey = `${p.targetClass}_${p.tabIndex}_${p.row}_${p.col}`;
    const rcKey = `${p.targetClass}_${p.row}_${p.col}`;
    const rKey = `${p.targetClass}_${p.row}`;
    const cKey = String(p.targetClass);
    (byPos.get(posKey) ?? byPos.set(posKey, []).get(posKey)!).push(p);
    (byClassRowCol.get(rcKey) ?? byClassRowCol.set(rcKey, []).get(rcKey)!).push(p);
    (byClassRow.get(rKey) ?? byClassRow.set(rKey, []).get(rKey)!).push(p);
    (byClass.get(cKey) ?? byClass.set(cKey, []).get(cKey)!).push(p);
  }
  return { byPos, byClassRowCol, byClassRow, byClass };
}

/**
 * Static map of D2R base item codes → class restriction.
 *
 * Sources:
 *   - Vanilla class-restricted types from Official/itemtypes.txt (pelt→dru, head→nec,
 *     phlm→bar, ashd→pal, orb→sor, abow/ajav/aspe→ama, h2h/h2h2→ass)
 *   - Custom warlock grimoire codes (wa6, wac, wae, waf) present only in this mod's
 *     uniqueitems.txt — not in Official weapons/armor data.
 */
const ITEM_CLASS_MAP: Map<string, ClassCode> = new Map([
  // Druid pelts (dr1–drf)
  ...(['dr1','dr2','dr3','dr4','dr5','dr6','dr7','dr8','dr9','dra','drb','drc','drd','dre','drf'] as const)
    .map((c): [string, ClassCode] => [c, 'dru']),
  // Necromancer shrunken heads (ne1–nef)
  ...(['ne1','ne2','ne3','ne4','ne5','ne6','ne7','ne8','ne9','nea','neb','neg','ned','nee','nef'] as const)
    .map((c): [string, ClassCode] => [c, 'nec']),
  // Barbarian primal helms (ba1–baf)
  ...(['ba1','ba2','ba3','ba4','ba5','ba6','ba7','ba8','ba9','baa','bab','bac','bad','bae','baf'] as const)
    .map((c): [string, ClassCode] => [c, 'bar']),
  // Paladin auric shields (pa1–paf)
  ...(['pa1','pa2','pa3','pa4','pa5','pa6','pa7','pa8','pa9','paa','pab','pac','pad','pae','paf'] as const)
    .map((c): [string, ClassCode] => [c, 'pal']),
  // Sorceress orbs (ob1–obf)
  ...(['ob1','ob2','ob3','ob4','ob5','ob6','ob7','ob8','ob9','oba','obb','obc','obd','obe','obf'] as const)
    .map((c): [string, ClassCode] => [c, 'sor']),
  // Amazon weapons — bows, javelins, spears (am1–amf)
  ...(['am1','am2','am3','am4','am5','am6','am7','am8','am9','ama','amb','amc','amd','ame','amf'] as const)
    .map((c): [string, ClassCode] => [c, 'ama']),
  // Assassin claws — h2h and h2h2 types
  ...(['ktr','wrb','axf','ces','clw','btl','skr','9ar','9wb','9xf','9cs','9lw','9tw','9qr',
       '7ar','7wb','7xf','7cs','7lw','7tw','7qr'] as const)
    .map((c): [string, ClassCode] => [c, 'ass']),
  // Warlock grimoires — custom codes in this mod (not in Official item data)
  ['wa6', 'war'],
  ['wac', 'war'],
  ['wae', 'war'],
  ['waf', 'war'],
]);

/**
 * Remap class-restricted `skill` and `charged` prop params in uniqueitems.txt.
 *
 * uniqueitems.txt differs from magicprefix/magicsuffix in two ways:
 *   1. No `class` column — class restriction is derived from the item's base `code` via ITEM_CLASS_MAP.
 *   2. Uses `prop*`/`par*` columns (not `mod*code`/`mod*param`).
 *      `skill` params may be numeric IDs (vanilla items) OR skill name strings (custom items).
 *      `charged` params are always numeric IDs.
 *
 * Remapping strategy (same grid-position logic as remapClassItemSkills):
 *   For each row whose `code` maps to a class restriction:
 *   1. Find placement P for the original skill (by ID or by name)
 *   2. Look up placement Q at the same (tabIndex, row, col) in the restricted class
 *   3. Write Q's skill ID (numeric props) or name (string props) back into par*
 *
 * `skilltab` entries are intentionally left unchanged.
 */
export function remapUniqueItemSkills(
  headers: string[],
  rows: string[][],
  placements: SkillPlacement[],
  idMapping: Map<number, number> | undefined,
): string[][] {
  const byName = new Map<string, SkillPlacement>(placements.map(p => [p.skill.skill, p]));
  const byId = new Map<number, SkillPlacement>(placements.map(p => [p.skill.id, p]));
  const { byPos, byClassRowCol, byClassRow, byClass } = buildPlacementIndices(placements);

  const codeCol = headers.indexOf('code');
  if (codeCol === -1) return rows;

  return rows.map(row => {
    const itemCode = row[codeCol]?.trim();
    if (!itemCode) return row;

    const classRestriction = ITEM_CLASS_MAP.get(itemCode);
    const updated = [...row];

    for (let slot = 1; slot <= 12; slot++) {
      const propCol = headers.indexOf(`prop${slot}`);
      const parCol = headers.indexOf(`par${slot}`);
      if (propCol === -1 || parCol === -1) continue;

      const prop = updated[propCol];
      const par = updated[parCol];
      if (!par?.trim()) continue;

      // Procs (CTC family + charged): identity-remap the vanilla skill via
      // idMapping so the original D2R proc assignment is preserved.
      if (PROC_CODES.has(prop)) {
        updated[parCol] = remapRowIndexParam(par, idMapping);
        continue;
      }

      // `oskill` granter: identity-preserve via idMapping (vanilla intent).
      if (GRANTER_ROWINDEX_CODES.has(prop)) {
        updated[parCol] = remapRowIndexParam(par, idMapping);
        continue;
      }

      if (prop !== 'skill') continue;

      // `skill` granter on non-class-restricted items: identity-preserve via
      // idMapping. Vanilla "+N to <skill>" on a Sorc-themed staff should still
      // grant the same skill after reorderSkillsRows shifts row positions.
      // Numeric par only — string skill names are name-resolved by the engine
      // and unaffected by row shuffling.
      if (!classRestriction) {
        const numId = parseInt(par.trim(), 10);
        if (!isNaN(numId)) updated[parCol] = remapRowIndexParam(par, idMapping);
        continue;
      }

      // `skill` granter on class-restricted items: position-remap to a
      // castable skill at the same grid slot in the restricted class.
      let srcPlacement: SkillPlacement | undefined;
      let useNumeric: boolean;
      const numId = parseInt(par.trim(), 10);
      if (!isNaN(numId)) {
        srcPlacement = byId.get(numId);
        useNumeric = true;
      } else {
        srcPlacement = byName.get(par.trim());
        useNumeric = false;
      }
      if (!srcPlacement) continue;

      const destPlacement = findCastableDestination(
        classRestriction, srcPlacement, byPos, byClassRowCol, byClassRow, byClass,
      );
      if (!destPlacement) continue;

      updated[parCol] = useNumeric
        ? String(idMapping?.get(destPlacement.skill.id) ?? destPlacement.skill.id)
        : destPlacement.skill.skill;
    }
    return updated;
  });
}

/**
 * Remap class-restricted `skill` and `charged` mod params in magic affix files.
 *
 * After the skill shuffle, class-specific item affixes (e.g. charged suffixes on
 * Amazon-restricted items) still reference original skill names / IDs that may no
 * longer belong to that class.  This function finds the skill now occupying the
 * same grid position in the restricted class and substitutes its name or ID.
 *
 * Remapping strategy:
 *   For each row with a non-empty `class` column and mod code `skill` or `charged`:
 *   1. Find placement P for the original skill (by name for `skill`, by ID for `charged`)
 *   2. P.tabIndex / P.row / P.col describe where that skill sits in its new class
 *   3. Find placement Q where Q.targetClass === classRestriction at the same (tab, row, col)
 *   4. Substitute Q's skill name (for `skill`) or numeric ID (for `charged`)
 *
 * `skilltab` entries (tree-wide bonuses) are intentionally left unchanged — they
 * reference tree-slot indices (e.g. 15/16/17 for druid) which remain class-bound
 * regardless of which skills fill the tree.
 */
export function remapClassItemSkills(
  headers: string[],
  rows: string[][],
  placements: SkillPlacement[],
  idMapping: Map<number, number> | undefined,
  procRng?: SeededRNG,
): string[][] {
  const byName = new Map<string, SkillPlacement>(placements.map(p => [p.skill.skill, p]));
  const byId = new Map<number, SkillPlacement>(placements.map(p => [p.skill.id, p]));
  const { byPos, byClassRowCol, byClassRow, byClass } = buildPlacementIndices(placements);

  // Proc pools for INJECTED_PROC_PARAM resolution: all eligible proc targets,
  // plus a per-class subset for class-restricted affixes. Built once per call.
  // Uses isProcTarget (castable minus summons / poor-proc skills), NOT the
  // broader isCastableTarget used by the `+N to skill` granter path below.
  const allCastable = placements.filter(p => isProcTarget(p.skill));
  const castableByClass = new Map<string, SkillPlacement[]>();
  for (const [cls, ps] of byClass) {
    castableByClass.set(cls, ps.filter(p => isProcTarget(p.skill)));
  }

  // Resolve a sentinel-injected proc to a random castable skill's final row index.
  const pickInjectedProcParam = (classRestriction: string | undefined): string => {
    let pool = classRestriction ? castableByClass.get(classRestriction) : allCastable;
    if (!pool || pool.length === 0) pool = allCastable;
    if (pool.length === 0) return '0';
    const chosen = procRng ? pool[procRng.randInt(0, pool.length - 1)] : pool[0];
    return String(idMapping?.get(chosen.skill.id) ?? chosen.skill.id);
  };

  const classCol = headers.indexOf('class');
  if (classCol === -1) return rows;

  return rows.map(row => {
    const classRestriction = row[classCol]?.trim();
    const updated = [...row];

    for (let slot = 1; slot <= 3; slot++) {
      const codeCol = headers.indexOf(`mod${slot}code`);
      const paramCol = headers.indexOf(`mod${slot}param`);
      if (codeCol === -1 || paramCol === -1) continue;

      const code = updated[codeCol];
      const param = updated[paramCol];
      if (!param?.trim()) continue;

      // Procs (CTC family + charged). Mutation-injected procs carry the sentinel
      // param and get a random castable skill; vanilla procs identity-remap via
      // idMapping so the original D2R proc assignment is preserved.
      if (PROC_CODES.has(code)) {
        updated[paramCol] = param.trim() === INJECTED_PROC_PARAM
          ? pickInjectedProcParam(classRestriction)
          : remapRowIndexParam(param, idMapping);
        continue;
      }

      // `oskill` granter: identity-preserve via idMapping (vanilla intent).
      if (GRANTER_ROWINDEX_CODES.has(code)) {
        updated[paramCol] = remapRowIndexParam(param, idMapping);
        continue;
      }

      if (code !== 'skill') continue;

      // `skill` granter on non-class-restricted affixes: identity-preserve.
      if (!classRestriction) {
        const numId = parseInt(param.trim(), 10);
        if (!isNaN(numId)) updated[paramCol] = remapRowIndexParam(param, idMapping);
        continue;
      }

      // `skill` granter on class-restricted affixes: position-remap to a
      // castable skill at the same grid slot in the restricted class.
      const srcPlacement = byName.get(param.trim());
      if (!srcPlacement) continue;

      const destPlacement = findCastableDestination(
        classRestriction, srcPlacement, byPos, byClassRowCol, byClassRow, byClass,
      );
      if (!destPlacement) continue;

      updated[paramCol] = destPlacement.skill.skill;
    }
    return updated;
  });
}
