/**
 * Which checks a D2R Randomizer slot holds, for the list on /archipelago.
 *
 * A port of active_location_names in apworld/d2rr/ids.py, run over the generated
 * ap-names.json. scripts/verify-ap-ids.mjs compares its counts with the Python for every
 * goal and every check toggle, so the page cannot promise a check the room leaves out.
 *
 * No imports: the verify script loads this file on its own.
 */

/** One location: [id, name, kind, difficulty, act, town]. Level milestones have -1s. */
export type ApLocation = [number, string, 'quest' | 'waypoint' | 'area' | 'level' | 'kill', number, number, number];

export interface ApNames {
  levelCaps: number[][];
  items: { name: string; group: string }[];
  locations: ApLocation[];
  difficulty: string[];
}

export interface CheckOptions {
  goalDifficulty: number;
  /** The last act with checks on the goal difficulty (0-4). */
  goalAct: number;
  waypoints: boolean;
  areas: boolean;
  levels: boolean;
  superUniques: boolean;
}

/** How many acts of a difficulty carry checks: all five below the goal's difficulty. */
export function actsIn(difficulty: number, goalDifficulty: number, goalAct: number): number {
  if (difficulty < goalDifficulty) return 5;
  return difficulty === goalDifficulty ? goalAct + 1 : 0;
}

export function activeLocations(names: ApNames, o: CheckOptions): ApLocation[] {
  const cap = names.levelCaps[o.goalDifficulty][o.goalAct];
  return names.locations.filter(([, name, kind, difficulty, act, town]) => {
    if (town) return false;
    switch (kind) {
      case 'level': {
        const clvl = Number(name.slice('Level '.length));
        return o.levels && clvl <= cap;
      }
      case 'waypoint':
        if (!o.waypoints) return false;
        break;
      case 'area':
        if (!o.areas) return false;
        break;
      case 'kill':
        if (!o.superUniques) return false;
        break;
    }
    return act < actsIn(difficulty, o.goalDifficulty, o.goalAct);
  });
}
