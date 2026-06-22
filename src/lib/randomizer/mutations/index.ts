/**
 * Weekly challenge mutation orchestrator.
 * Server-only — imports file I/O via the individual mutation modules.
 */
import { MUTATIONS, WEEKLY_MUTATIONS, getActiveMutations } from '@/lib/mutations/registry';
import { applyHyperdrive } from './hyperdrive';
import { applyHeavyBurden, injectArmorProcs } from './heavy-burden';
import { applyHollowShell } from './hollow-shell';
import { applyBloodthirst } from './bloodthirst';
import { applyTheHorde } from './the-horde';
import { applyGlassCannon } from './glass-cannon';
import { applyPestilence } from './pestilence';
import { applyArcaneSurge } from './arcane-surge';
import { applyTitansGrip, injectWeaponProcs } from './titans-grip';
import { applyDeadReckoning } from './dead-reckoning';
import { applyTemperedEdge } from './tempered-edge';
import { applyEntropy } from './entropy';
import { applyHouseAlwaysWins } from './house-always-wins';

export { getActiveMutations };

/**
 * All mutable txt data needed across mutations.
 * Each property is { headers, rows } matching loadTxtFile() output.
 */
export interface MutationContext {
  monstats:      { headers: string[]; rows: string[][] };
  charstats:     { headers: string[]; rows: string[][] };
  skills:        { headers: string[]; rows: string[][] };
  superuniques:  { headers: string[]; rows: string[][] };
  treasureclass: { headers: string[]; rows: string[][] };
  experience:    { headers: string[]; rows: string[][] };
  armor:         { headers: string[]; rows: string[][] };
  weapons:       { headers: string[]; rows: string[][] };
  misc:          { headers: string[]; rows: string[][] };
  uniqueitems:   { headers: string[]; rows: string[][] };
  magicprefix:   { headers: string[]; rows: string[][] };
  magicsuffix:   { headers: string[]; rows: string[][] };
}

type ApplyFn = (ctx: MutationContext) => void;

const APPLY_FNS: Record<number, ApplyFn> = {
  1:  applyHyperdrive,
  2:  applyHeavyBurden,
  3:  applyHollowShell,
  4:  applyBloodthirst,
  5:  applyTheHorde,
  6:  applyGlassCannon,
  7:  applyPestilence,
  8:  applyArcaneSurge,
  9:  applyHouseAlwaysWins,
  10: applyTemperedEdge,
  11: applyTitansGrip,
  13: applyDeadReckoning,
  14: applyEntropy,
};

/**
 * Pre-remap hook: inject magic affix modifications that must be in place
 * before remapClassItemSkills runs so skill IDs are assigned correctly.
 * Call this on raw affix data, before the skill remapper.
 */
export function preApplyMagicAffixMutations(
  weekNumber: number,
  prefix: { headers: string[]; rows: string[][] },
  suffix: { headers: string[]; rows: string[][] },
): void {
  const ids = WEEKLY_MUTATIONS[(weekNumber - 1) % WEEKLY_MUTATIONS.length];
  for (const id of ids) {
    if (MUTATIONS[id]?.id === 'heavy-burden') {
      injectArmorProcs(prefix.headers, prefix.rows);
      injectArmorProcs(suffix.headers, suffix.rows);
    }
    if (MUTATIONS[id]?.id === 'titans-grip') {
      injectWeaponProcs(prefix.headers, prefix.rows);
      injectWeaponProcs(suffix.headers, suffix.rows);
    }
  }
}

/** True if the given mutation id is one of the active mutations for this week number. */
export function isMutationActiveForWeek(weekNumber: number, mutationId: string): boolean {
  const ids = WEEKLY_MUTATIONS[(weekNumber - 1) % WEEKLY_MUTATIONS.length];
  return ids.some((id) => MUTATIONS[id]?.id === mutationId);
}

/** Apply the active mutations for the given week number to the provided context. */
export function applyWeeklyMutations(weekNumber: number, ctx: MutationContext): void {
  const ids = WEEKLY_MUTATIONS[(weekNumber - 1) % WEEKLY_MUTATIONS.length];
  for (const id of ids) {
    const fn = APPLY_FNS[id];
    if (fn) fn(ctx);
  }
}
