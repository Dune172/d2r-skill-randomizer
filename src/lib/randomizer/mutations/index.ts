/**
 * Weekly challenge mutation orchestrator.
 * Server-only — imports file I/O via the individual mutation modules.
 */
import { MUTATIONS, WEEKLY_PAIRS, getActivePair } from '@/lib/mutations/registry';
import { applyHyperdrive } from './hyperdrive';
import { applyHeavyBurden } from './heavy-burden';
import { applyHollowShell } from './hollow-shell';
import { applyBloodthirst } from './bloodthirst';
import { applyTheHorde } from './the-horde';
import { applyGlassCannon } from './glass-cannon';
import { applyPestilence } from './pestilence';
import { applyArcaneSurge } from './arcane-surge';
import { applyTitansGrip } from './titans-grip';
import { applyDeadReckoning } from './dead-reckoning';
import { applyIronclad } from './ironclad';
import { applyEntropy } from './entropy';

export { getActivePair };

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
  10: applyIronclad,
  11: applyTitansGrip,
  13: applyDeadReckoning,
  14: applyEntropy,
};

/** Apply both mutations for the given week number to the provided context. */
export function applyWeeklyMutations(weekNumber: number, ctx: MutationContext): void {
  const [a, b] = WEEKLY_PAIRS[(weekNumber - 1) % WEEKLY_PAIRS.length];
  for (const id of [a, b]) {
    const fn = APPLY_FNS[id];
    if (fn) fn(ctx);
  }
}
