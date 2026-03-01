import { SkillEntry, SkillPlacement } from './types';
import { SeededRNG } from './seed';

/**
 * Assign randomized attack skills and a random paladin aura to every hireling
 * subtype, tiered by Act and Difficulty.
 *
 * ATTACK SKILLS (Mode=4, 7, 14)
 * Attack pools are built from all randomized placements, filtered by each
 * hireling's equipped weapon type.  Each attack slot (identified by Mode ∈
 * {'4','7','14'}) gets an independently-chosen skill from the appropriate pool.
 *
 * AURA (Mode=1)
 * Tier pools are built from the randomized paladin placements so the available
 * auras vary per seed:
 *   - Normal Acts 1–3 (Diff=1): rows 1–2 (reqlevel 1 or 6)
 *   - Normal Act 5    (Diff=1): rows 2–3 (reqlevel 6 or 12)
 *   - Nightmare/Hell  (Diff≥2): any row
 *
 * Desert Mercenaries already have an aura in Skill2 (Mode=1); we replace it
 * in-place, preserving the existing Level and LvlPerLvl progression values.
 * All other hireling types get an aura appended to their first empty skill slot,
 * using a scaling formula derived from the vanilla merc aura pattern.
 *
 * Mode=5 (passive/utility) slots are never touched.
 *
 * Modifies hireling rows in-place.
 */
export function writeHirelingRows(
  headers: string[],
  rows: string[][],
  placements: SkillPlacement[],
  rng: SeededRNG,
): void {
  // ── Helper predicates ─────────────────────────────────────────────────────

  function hasType(skill: SkillEntry, type: string): boolean {
    return skill.itypea1 === type || skill.itypea2 === type || skill.itypea3 === type;
  }

  /** A skill is "attackable" if it is not an aura, not a passive, and not
   *  restricted to shapeshifted form. */
  function isAttackable(skill: SkillEntry): boolean {
    return !skill.aurastate && !skill.passiveitype && skill.restrict !== 2;
  }

  // ── Build attack pools ────────────────────────────────────────────────────
  // Deduplicate by skill name to avoid bias from duplicate placements.

  function dedup(names: string[]): string[] {
    return [...new Set(names)];
  }

  const allSkills = placements.map(p => p.skill);

  const bowPool = dedup(
    allSkills
      .filter(s => isAttackable(s) && hasType(s, 'miss') && s.weapsel !== 3)
      .map(s => s.skill),
  );

  const spearMelePool = dedup(
    allSkills
      .filter(s => isAttackable(s) && (hasType(s, 'spea') || hasType(s, 'mele')) && s.weapsel !== 3)
      .map(s => s.skill),
  );

  // Eastern Sorceror: elemental spells only, no weapon requirement at all
  const ELEM_TYPES = new Set(['fire', 'cold', 'ltng']);
  const sorcPool = dedup(
    allSkills
      .filter(s =>
        isAttackable(s) &&
        ELEM_TYPES.has(s.etype ?? '') &&
        !s.itypea1 && !s.itypea2 && !s.itypea3 && !s.itypeb1 &&
        s.weapsel !== 3,
      )
      .map(s => s.skill),
  );

  const mele2hsPool = dedup(
    allSkills
      .filter(s => isAttackable(s) && hasType(s, 'mele') && s.weapsel !== 3)
      .map(s => s.skill),
  );

  const mele1hsPool = dedup(
    allSkills
      .filter(s => isAttackable(s) && hasType(s, 'mele'))
      .map(s => s.skill),
  );

  function getAttackPool(hireling: string, subType: string): string[] {
    if (hireling === 'Rogue Scout')       return bowPool;
    if (hireling === 'Desert Mercenary')  return spearMelePool;
    if (hireling === 'Eastern Sorceror')  return sorcPool;
    if (hireling === 'Barbarian') {
      return subType.startsWith('1hs') ? mele1hsPool : mele2hsPool;
    }
    return [];
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
    return;
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
    const attackPool = getAttackPool(hireling, subType);

    if (attackPool.length === 0) {
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
        chosenAttacks.set(s, attackPool[rng.randInt(0, attackPool.length - 1)]);
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

    // ── STEP 2: Aura assignment (Mode=1) ──────────────────────────────────
    let auraPool: string[];
    if (diff >= 2) {
      auraPool = poolAll;
    } else if (act >= 4) {
      auraPool = buildAuraPool(2, 3);
    } else {
      auraPool = buildAuraPool(1, 2);
    }

    const auraName = auraPool[rng.randInt(0, auraPool.length - 1)];

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
        // Find first empty skill slot
        let emptySlotIdx = -1;
        for (let s = 0; s < slotCols.length; s++) {
          const cols = slotCols[s];
          if (cols.skill !== -1 && !row[cols.skill]) {
            emptySlotIdx = s;
            break;
          }
        }
        if (emptySlotIdx === -1) {
          // All slots full — skip this row (shouldn't happen with vanilla data)
          continue;
        }

        const cols = slotCols[emptySlotIdx];
        // Scaling: approx 1 aura level per 4 hireling levels (matches Desert Merc pattern)
        const auraLevel = Math.max(1, Math.floor(hiringLevel / 4));
        const lvlPerLvl = isLast ? 0 : 7;

        row[cols.skill]        = auraName;
        row[cols.mode]         = '1';
        row[cols.chance]       = '10';
        row[cols.chancePerLvl] = '0';
        row[cols.level]        = String(auraLevel);
        row[cols.lvlPerLvl]    = String(lvlPerLvl);
      }
    }
  }
}
