import { ClassCode, SkillPlacement } from './types';
import { SeededRNG } from './seed';
import { isCastableTarget } from './skill-filters';
import { loadSkills } from '../data-loader';

// Vanilla reqlevel by skill name. Substitute SkillEntries inherit reqlevel
// from their source skill, not the dropped skill — so p.skill.reqlevel can
// say "6" for a substitute "Frenzy" even though vanilla Frenzy is reqlevel
// 24. The user wants exclusion based on the *displayed* skill name (vanilla
// reqlevel), so look up by name from skills.json.
let _vanillaReqlevelByName: Map<string, number> | null = null;
function vanillaReqlevelByName(): Map<string, number> {
  if (_vanillaReqlevelByName) return _vanillaReqlevelByName;
  const m = new Map<string, number>();
  for (const s of loadSkills()) m.set(s.skill, s.reqlevel ?? 1);
  _vanillaReqlevelByName = m;
  return m;
}

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

// Proc codes — destination must be castable AND each slot is randomized
// from the seeded pool. On class-restricted items the pool is the restricted
// class's castable skills; on unrestricted items, all castables.
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

// Vanilla reqlevels are 1 / 6 / 12 / 18 / 24 / 30. Procs that fire random
// top-tier skills (Meteor, Hydra, Frozen Orb, etc.) are too strong for
// item affixes — exclude them from the pool. SkillEntry.reqlevel is loaded
// from skills.json so it reflects the VANILLA reqlevel, not any post-
// shuffle reassignment.
const PROC_POOL_MAX_REQLEVEL = 18;

// Per-class castable placement pools, plus a global pool of all castable
// placements. Used by proc-slot randomization. Built once per remap call.
function buildCastablePools(placements: SkillPlacement[]) {
  const reqByName = vanillaReqlevelByName();
  const byClass = new Map<string, SkillPlacement[]>();
  const all: SkillPlacement[] = [];
  for (const p of placements) {
    if (!isCastableTarget(p.skill)) continue;
    // Filter by VANILLA reqlevel of the displayed skill name. Substitutes
    // keep the dropped skill's name but inherit source's reqlevel; we want
    // to exclude based on what the player sees in the proc tooltip.
    const vanillaReq = reqByName.get(p.skill.skill) ?? p.skill.reqlevel ?? 1;
    if (vanillaReq > PROC_POOL_MAX_REQLEVEL) continue;
    const k = String(p.targetClass);
    (byClass.get(k) ?? byClass.set(k, []).get(k)!).push(p);
    all.push(p);
  }
  return { byClassCastable: byClass, allCastable: all };
}

function pickRandomFromPool(
  pool: SkillPlacement[],
  rng: SeededRNG,
): SkillPlacement | undefined {
  if (pool.length === 0) return undefined;
  return pool[rng.randInt(0, pool.length - 1)];
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
  procRng: SeededRNG,
): string[][] {
  const byName = new Map<string, SkillPlacement>(placements.map(p => [p.skill.skill, p]));
  const byId = new Map<number, SkillPlacement>(placements.map(p => [p.skill.id, p]));
  const { byPos, byClassRowCol, byClassRow, byClass } = buildPlacementIndices(placements);
  const { byClassCastable, allCastable } = buildCastablePools(placements);

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

      // Procs (CTC family + charged): random castable pick from class pool
      // (or global pool if not class-restricted). Output is the new row
      // index of the picked skill.
      if (PROC_CODES.has(prop)) {
        const pool = classRestriction
          ? (byClassCastable.get(classRestriction) ?? allCastable)
          : allCastable;
        const pick = pickRandomFromPool(pool, procRng);
        if (pick) {
          updated[parCol] = String(idMapping?.get(pick.skill.id) ?? pick.skill.id);
        }
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
  procRng: SeededRNG,
): string[][] {
  const byName = new Map<string, SkillPlacement>(placements.map(p => [p.skill.skill, p]));
  const byId = new Map<number, SkillPlacement>(placements.map(p => [p.skill.id, p]));
  const { byPos, byClassRowCol, byClassRow, byClass } = buildPlacementIndices(placements);
  const { byClassCastable, allCastable } = buildCastablePools(placements);

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

      // Procs (CTC family + charged): random castable pick from class pool
      // (or global pool if no class restriction). Most magic-suffix CTCs
      // have no class column, so this branch runs whether or not
      // classRestriction is set.
      if (PROC_CODES.has(code)) {
        const pool = classRestriction
          ? (byClassCastable.get(classRestriction) ?? allCastable)
          : allCastable;
        const pick = pickRandomFromPool(pool, procRng);
        if (pick) {
          updated[paramCol] = String(idMapping?.get(pick.skill.id) ?? pick.skill.id);
        }
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
