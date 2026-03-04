import { SkillEntry, SkillPlacement } from './types';
import { SeededRNG } from './seed';

// Native class of each hireling type — used to group icon injection targets.
const HIRELING_NATIVE_CLASS: Record<string, string> = {
  'Rogue Scout':      'ama',
  'Desert Mercenary': 'ama',
  'Eastern Sorceror': 'sor',
  'Barbarian':        'bar',
};

/**
 * Assign randomized attack skills and a random paladin aura to every hireling
 * subtype, tiered by Act and Difficulty.
 *
 * ATTACK SKILLS (Mode=4, 7, 14)
 * Attack pools are built from ALL randomized placements, filtered by weapon type.
 * Skills are tiered by row:
 *   - Normal Acts 1–3 (Diff=1): rows 1–2
 *   - Normal Act 4–5  (Diff=1): rows 2–3
 *   - Nightmare/Hell  (Diff≥2): any row
 *
 * AURA (Mode=1)
 * Tier pools are built from all randomized paladin placements:
 *   - Normal Acts 1–3 (Diff=1): rows 1–2
 *   - Normal Act 5    (Diff=1): rows 2–3
 *   - Nightmare/Hell  (Diff≥2): any row
 *
 * Desert Mercenaries already have an aura in Skill2 (Mode=1); we replace it
 * in-place, preserving the existing Level and LvlPerLvl progression values.
 * All other hireling types have the aura replace their LAST filled attack slot,
 * keeping the total slot count identical to vanilla so the aura is always
 * within the hiring panel's visible range.
 *
 * Mode=5 (passive/utility) slots are never touched.
 *
 * Returns a Map<nativeClass, Set<skillName>> of every skill name written to
 * every hireling slot. This is used by the icon assembler to inject the correct
 * icons into the native class sprite at extra frame positions, ensuring the
 * hiring panel displays the right icon for each assigned skill.
 *
 * Modifies hireling rows in-place.
 */
export function writeHirelingRows(
  headers: string[],
  rows: string[][],
  placements: SkillPlacement[],
  rng: SeededRNG,
  options: { aura: boolean; skills: boolean } = { aura: true, skills: true },
): Map<string, Set<string>> {
  // Tracks all skill names written to hireling slots, grouped by native class.
  const hirelingSkillsByNativeClass = new Map<string, Set<string>>();

  if (!options.aura && !options.skills) return hirelingSkillsByNativeClass;

  // ── Helper predicates ─────────────────────────────────────────────────────

  function hasType(skill: SkillEntry, type: string): boolean {
    return skill.itypea1 === type || skill.itypea2 === type || skill.itypea3 === type;
  }

  /** A skill is "attackable" if it is not an aura, not a passive, and not
   *  restricted to shapeshifted form. */
  function isAttackable(skill: SkillEntry): boolean {
    return !skill.aurastate && !skill.passiveitype && skill.restrict !== 2;
  }

  function dedup(names: string[]): string[] {
    return [...new Set(names)];
  }

  function recordHirelingSkill(hireling: string, skillName: string): void {
    const nativeCode = HIRELING_NATIVE_CLASS[hireling] ?? '';
    if (!nativeCode) return;
    if (!hirelingSkillsByNativeClass.has(nativeCode))
      hirelingSkillsByNativeClass.set(nativeCode, new Set());
    hirelingSkillsByNativeClass.get(nativeCode)!.add(skillName);
  }

  const ELEM_TYPES = new Set(['fire', 'cold', 'ltng']);

  // ── Build attack tier maps from ALL placements ────────────────────────────
  // Row maps are built from the full placement set (any class), filtered only
  // by weapon type and attackability. Icon correctness is guaranteed by the
  // icon assembler injecting each assigned skill's icon into the native class
  // sprite at extra frame positions.

  function buildRowMap(
    predicate: (skill: SkillEntry) => boolean,
  ): Map<number, string[]> {
    const rowMap = new Map<number, string[]>();
    for (const p of placements) {
      if (!predicate(p.skill)) continue;
      if (!rowMap.has(p.row)) rowMap.set(p.row, []);
      rowMap.get(p.row)!.push(p.skill.skill);
    }
    return rowMap;
  }

  const attackRowMaps: Record<string, Map<number, string[]>> = {
    'Rogue Scout':      buildRowMap(s => isAttackable(s) && hasType(s, 'miss') && s.weapsel !== 3),
    'Desert Mercenary': buildRowMap(s => isAttackable(s) && (hasType(s, 'spea') || hasType(s, 'mele')) && s.weapsel !== 3),
    'Eastern Sorceror': buildRowMap(s => isAttackable(s) && ELEM_TYPES.has(s.etype ?? '') && !s.itypea1 && !s.itypea2 && !s.itypea3 && !s.itypeb1 && s.weapsel !== 3),
    'Barbarian_2hs':    buildRowMap(s => isAttackable(s) && hasType(s, 'mele') && s.weapsel !== 3),
    'Barbarian_1hs':    buildRowMap(s => isAttackable(s) && hasType(s, 'mele')),
  };

  function getAttackRowMap(hireling: string, subType: string): Map<number, string[]> {
    if (hireling === 'Barbarian') {
      return subType.startsWith('1hs') ? attackRowMaps['Barbarian_1hs'] : attackRowMaps['Barbarian_2hs'];
    }
    return attackRowMaps[hireling] ?? new Map();
  }

  // Build a tier pool from a row map using the same act/diff logic as auras.
  function buildTierPool(rowMap: Map<number, string[]>, act: number, diff: number): string[] {
    const allRows = [...rowMap.values()].flat();
    if (allRows.length === 0) return [];

    const getRows = (...rowNums: number[]): string[] => {
      const r = rowNums.flatMap(n => rowMap.get(n) ?? []);
      return r.length > 0 ? r : allRows; // fallback to all rows if tier is empty
    };

    let pool: string[];
    if (diff >= 2)     pool = allRows;
    else if (act >= 4) pool = getRows(2, 3);
    else               pool = getRows(1, 2);

    return pool.length > 0 ? pool : allRows;
  }

  // ── Build aura pools from randomized paladin placements ───────────────────
  // Only include original paladin auras (aurastate non-empty, charclass 'pal').
  // Group by placement.row (1–6) — the row in the randomized skill tree.

  const byRow = new Map<number, string[]>(); // row → [skill names]
  for (const p of placements) {
    if (p.skill.charclass === 'pal' && p.skill.aurastate) {
      const row = p.row;
      if (!byRow.has(row)) byRow.set(row, []);
      byRow.get(row)!.push(p.skill.skill);
    }
  }

  const poolAll: string[] = [];
  for (const names of byRow.values()) poolAll.push(...names);

  function buildAuraPool(...auraRows: number[]): string[] {
    const pool: string[] = [];
    for (const r of auraRows) {
      const names = byRow.get(r);
      if (names) pool.push(...names);
    }
    return pool.length > 0 ? pool : poolAll;
  }

  if (poolAll.length === 0) {
    console.warn('hireling-writer: no paladin auras found in placements, skipping hireling aura assignment');
    return hirelingSkillsByNativeClass;
  }

  // ── Resolve column indices ────────────────────────────────────────────────
  const actCol  = headers.indexOf('Act');
  const diffCol = headers.indexOf('Difficulty');
  const lvlCol  = headers.indexOf('Level');
  const hirCol  = headers.indexOf('Hireling');
  const subCol  = headers.indexOf('*SubType');

  // Skill slot columns: Skill1..6, Mode1..6, Chance1..6, ChancePerLvl1..6, Level1..6, LvlPerLvl1..6
  const slotCols: Array<{
    skill: number; mode: number; chance: number; chancePerLvl: number; level: number; lvlPerLvl: number;
  }> = [];
  for (let i = 1; i <= 6; i++) {
    slotCols.push({
      skill:        headers.indexOf(`Skill${i}`),
      mode:         headers.indexOf(`Mode${i}`),
      chance:       headers.indexOf(`Chance${i}`),
      chancePerLvl: headers.indexOf(`ChancePerLvl${i}`),
      level:        headers.indexOf(`Level${i}`),
      lvlPerLvl:    headers.indexOf(`LvlPerLvl${i}`),
    });
  }

  // Attack mode values that we replace
  const ATTACK_MODES = new Set(['4', '7', '14']);

  // ── Group rows by (Hireling, SubType) ────────────────────────────────────
  const groups = new Map<string, number[]>();
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const key = `${row[hirCol]}||${row[subCol]}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(i);
  }

  // ── Process each group ────────────────────────────────────────────────────
  for (const [, indices] of groups) {
    const firstRow = rows[indices[0]];
    const hireling = firstRow[hirCol];
    const subType  = firstRow[subCol];
    const act      = parseInt(firstRow[actCol]  || '0', 10);
    const diff     = parseInt(firstRow[diffCol] || '1', 10);

    // ── STEP 1: Attack skill assignment (Mode=4/7/14) ─────────────────────
    if (options.skills) {
      const rowMap = getAttackRowMap(hireling, subType);
      const tierPool = dedup(buildTierPool(rowMap, act, diff));

      if (tierPool.length === 0) {
        console.warn(`hireling-writer: no attack pool for hireling "${hireling}" subType "${subType}", skipping attack randomization`);
      } else {
        // Identify which slot indices (0-based) are attack slots in this group.
        // Scan ALL rows in the group so we catch slots that appear only in some
        // rows (e.g. Rogue Scout Skill3 which is absent in lower-level rows).
        const attackSlotSet = new Set<number>();
        for (const ri of indices) {
          const r = rows[ri];
          for (let s = 0; s < slotCols.length; s++) {
            const cols = slotCols[s];
            if (
              cols.skill !== -1 && cols.mode !== -1 &&
              r[cols.skill] &&
              ATTACK_MODES.has(r[cols.mode])
            ) {
              attackSlotSet.add(s);
            }
          }
        }
        const attackSlotIndices = [...attackSlotSet].sort((a, b) => a - b);

        // Pick one skill per attack slot index (independent rolls → varied skills)
        const chosenAttacks = new Map<number, string>();
        for (const s of attackSlotIndices) {
          const chosenSkill = tierPool[rng.randInt(0, tierPool.length - 1)];
          chosenAttacks.set(s, chosenSkill);
          recordHirelingSkill(hireling, chosenSkill);
        }

        // Apply chosen skills to every row in the group, preserving all other columns.
        // Guard per-row: only write if this particular row actually has that slot filled.
        for (const ri of indices) {
          const row = rows[ri];
          for (const s of attackSlotIndices) {
            const cols = slotCols[s];
            if (row[cols.skill] && ATTACK_MODES.has(row[cols.mode])) {
              row[cols.skill] = chosenAttacks.get(s)!;
            }
          }
        }
      }
    } // end options.skills

    // ── STEP 2: Aura assignment (Mode=1) ──────────────────────────────────
    if (options.aura) {
      let auraPool: string[];
      if (diff >= 2) {
        auraPool = poolAll;
      } else if (act >= 4) {
        auraPool = buildAuraPool(2, 3);
      } else {
        auraPool = buildAuraPool(1, 2);
      }

      const auraName = auraPool[rng.randInt(0, auraPool.length - 1)];
      recordHirelingSkill(hireling, auraName);

      for (let gi = 0; gi < indices.length; gi++) {
        const ri = indices[gi];
        const row = rows[ri];
        const isLast = gi === indices.length - 1;

        const hiringLevel = parseInt(row[lvlCol] || '1', 10);

        // Try to find an existing always-on aura slot (Mode=1) to replace
        let targetSlotIdx = -1;
        for (let s = 0; s < slotCols.length; s++) {
          const cols = slotCols[s];
          if (cols.mode !== -1 && row[cols.mode] === '1') {
            targetSlotIdx = s;
            break;
          }
        }

        if (targetSlotIdx !== -1) {
          // Replace existing aura slot in-place, preserving Level/LvlPerLvl
          const cols = slotCols[targetSlotIdx];
          row[cols.skill] = auraName;
          // Mode, Chance, ChancePerLvl, Level and LvlPerLvl stay as-is
        } else {
          // Find LAST filled attack slot (Mode ∈ {4,7,14}) in this row.
          // Replacing the last attack slot keeps total slot count identical to
          // vanilla, so the aura always lands within the panel's visible range.
          let lastAttackSlotIdx = -1;
          for (let s = slotCols.length - 1; s >= 0; s--) {
            const cols = slotCols[s];
            if (
              cols.skill !== -1 && cols.mode !== -1 &&
              row[cols.skill] &&
              ATTACK_MODES.has(row[cols.mode])
            ) {
              lastAttackSlotIdx = s;
              break;
            }
          }
          if (lastAttackSlotIdx === -1) continue; // no attack slots → skip this row

          const cols = slotCols[lastAttackSlotIdx];
          row[cols.skill]        = auraName;
          row[cols.mode]         = '1';
          row[cols.chance]       = '10';
          row[cols.chancePerLvl] = '0';
          row[cols.level]        = String(Math.max(1, Math.floor(hiringLevel / 4)));
          row[cols.lvlPerLvl]    = isLast ? '0' : '10'; // match vanilla Desert Merc LvlPerLvl=10
        }
      }
    } // end options.aura
  }

  return hirelingSkillsByNativeClass;
}
