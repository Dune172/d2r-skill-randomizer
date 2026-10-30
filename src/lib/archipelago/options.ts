/**
 * The Archipelago options a D2R Randomizer slot can set, for the YAML builder on
 * /archipelago.
 *
 * A mirror of apworld/d2rr/options.py. Archipelago reads the Python; this file only has
 * to agree with it, and scripts/verify-ap-options.mjs fails if a key, a choice, a range
 * or a default differs.
 */

export const AP_GAME_NAME = 'D2R Randomizer';

/** Versions the page states. Kept beside the options so one check covers both. */
export const AP_WORLD_VERSION = '0.2.0';
export const AP_MINIMUM_ARCHIPELAGO = '0.6.7';

interface BaseOption {
  key: string;
  label: string;
  help: string;
  group: 'Goal' | 'Skill Points' | 'Checks' | 'The Mod' | 'Experimental';
}

export interface ChoiceOption extends BaseOption {
  type: 'choice';
  choices: { value: string; label: string }[];
  default: string;
}

export interface RangeOption extends BaseOption {
  type: 'range';
  min: number;
  max: number;
  default: number;
}

export interface ToggleOption extends BaseOption {
  type: 'toggle';
  default: boolean;
}

export type ApOption = ChoiceOption | RangeOption | ToggleOption;

const choice = (values: string[]) =>
  values.map(value => ({ value, label: value[0].toUpperCase() + value.slice(1) }));

export const AP_OPTIONS: ApOption[] = [
  {
    key: 'character_class', label: 'Character class', group: 'Goal', type: 'choice',
    choices: choice(['amazon', 'sorceress', 'necromancer', 'paladin', 'barbarian', 'druid', 'assassin', 'warlock']),
    default: 'paladin',
    help: 'The class you will create. Its tree is shuffled by the mod like every other.',
  },
  {
    key: 'goal_difficulty', label: 'Goal difficulty', group: 'Goal', type: 'choice',
    choices: choice(['normal', 'nightmare', 'hell']), default: 'normal',
    help: 'Earlier difficulties are played in full first.',
  },
  {
    key: 'goal_boss', label: 'Goal boss', group: 'Goal', type: 'choice',
    choices: choice(['andariel', 'duriel', 'mephisto', 'diablo', 'baal']), default: 'baal',
    help: 'Killing this boss on the goal difficulty finishes your slot. Andariel on Normal is about an hour.',
  },
  {
    key: 'skill_points', label: 'Skill points', group: 'Skill Points', type: 'range', min: 20, max: 600, default: 110,
    help: 'How many skill points the multiworld holds for you. Lowered automatically if your checks cannot hold them.',
  },
  {
    key: 'starting_skill_points', label: 'Starting skill points', group: 'Skill Points', type: 'range', min: 0, max: 5, default: 1,
    help: 'Taken out of the total and handed to you at the start.',
  },
  {
    key: 'logic_difficulty', label: 'Logic difficulty', group: 'Skill Points', type: 'choice',
    choices: choice(['relaxed', 'standard', 'strict']), default: 'standard',
    help: 'How many points the logic expects you to hold before each later act.',
  },
  {
    key: 'include_waypoints', label: 'Waypoint checks', group: 'Checks', type: 'toggle', default: true,
    help: 'Activating a waypoint is a check.',
  },
  {
    key: 'include_areas', label: 'Area checks', group: 'Checks', type: 'toggle', default: true,
    help: 'Entering an area for the first time is a check. The largest group by far.',
  },
  {
    key: 'include_level_milestones', label: 'Level checks', group: 'Checks', type: 'toggle', default: true,
    help: 'Reaching each character level is a check, up to about the level you have at the goal.',
  },
  {
    key: 'xp_multiplier', label: 'Experience multiplier', group: 'The Mod', type: 'range', min: 1, max: 3, default: 1,
    help: 'Worth raising for a synchronous game, so nobody waits on your levelling.',
  },
  {
    key: 'monster_shuffle', label: 'Monster shuffle', group: 'The Mod', type: 'toggle', default: false,
    help: 'Shuffle which monsters appear in which areas.',
  },
  {
    key: 'key_items', label: 'Horadric Keys', group: 'Experimental', type: 'toggle', default: false,
    help: 'The Cube will not assemble the Horadric Staff (2 keys) or Khalim’s Will (5) until you hold enough keys from the multiworld. Drink your starting Draught of Attunement first.',
  },
  {
    key: 'stat_points', label: 'Stat points', group: 'Experimental', type: 'choice',
    choices: choice(['vanilla', 'pooled']), default: 'vanilla',
    help: 'Pooled: level-ups grant no attribute points; they are items in the multiworld instead. When your pool is empty, the client asks for a Tonic of Renewal from the Sigil.',
  },
  {
    key: 'rune_percentage', label: 'Rune percentage', group: 'Experimental', type: 'range', min: 0, max: 100, default: 0,
    help: 'Share of filler items that are runes, collected by transmuting the Archipelago Sigil alone in the Horadric Cube.',
  },
  {
    key: 'trap_percentage', label: 'Trap percentage', group: 'Experimental', type: 'range', min: 0, max: 100, default: 0,
    help: 'Share of filler items that are traps: Mana Burn, Exhaustion, Brush with Death, Skill Lock, Gold Tax.',
  },
  {
    key: 'death_link', label: 'DeathLink', group: 'Experimental', type: 'toggle', default: false,
    help: 'When you die, everyone else with DeathLink dies, and the reverse.',
  },
];

export type ApOptionValues = Record<string, string | number | boolean>;

export function defaultApOptions(): ApOptionValues {
  return Object.fromEntries(AP_OPTIONS.map(o => [o.key, o.default]));
}

/** Slot names are limited to 16 characters by Archipelago. */
export function cleanSlotName(name: string): string {
  return name.replace(/[^A-Za-z0-9 _-]/g, '').trim().slice(0, 16);
}

/**
 * A YAML double-quoted string. Unquoted, PyYAML reads names like `yes`, `null` or `123`
 * as a boolean, null or number instead of the slot name.
 */
function yamlString(text: string): string {
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** The player options file Archipelago's generator reads. */
export function buildApYaml(slotName: string, values: ApOptionValues): string {
  const lines = [`name: ${yamlString(cleanSlotName(slotName) || 'Player')}`, `game: ${AP_GAME_NAME}`, `${AP_GAME_NAME}:`];
  for (const option of AP_OPTIONS) {
    const value = values[option.key] ?? option.default;
    lines.push(`  ${option.key}: ${value}`);
  }
  return lines.join('\n') + '\n';
}
