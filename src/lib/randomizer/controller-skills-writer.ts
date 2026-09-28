import fs from 'fs';
import path from 'path';
import type { SkillSubstitute } from './skill-placer';

/**
 * Remap data/hd/global/excel/controllerskillsettings.json to the shuffled skill rows.
 *
 * With a gamepad, D2R reads each skill's controller behavior from this file:
 * targeting (usageType / targetGroup — corpse, item, self), aura toggle slots
 * (toggleSlotState), ground-targeted validation (Blizzard, Meteor, Leap),
 * Teleport-style alwaysIgnoreTarget, distances, docking and rumble. Entries are
 * keyed by `id` = skills.txt row index, like monster and item skill refs (see
 * monstats-skill-remapper.ts). reorderSkillsRows() moves class skills to new
 * rows, so without this remap a skill inherits the controller behavior of
 * whatever vanilla skill used to own its row — e.g. an attack landing in an
 * aura's row became a toggle slot and the button did nothing.
 *
 * Controller-only: keyboard/mouse never reads this file.
 */

interface ControllerSkillEntry {
  name: string;
  id: number;
  [key: string]: unknown;
}

interface ControllerSkillSettings {
  controllerskilldata: ControllerSkillEntry[];
  [key: string]: unknown;
}

const VANILLA_PATH = path.join(process.cwd(), 'data', 'hd', 'global', 'excel', 'controllerskillsettings.json');

// Static game asset — read once per process.
let _vanillaRaw: string | null = null;

function loadVanillaControllerSkillSettings(): ControllerSkillSettings {
  _vanillaRaw ??= fs.readFileSync(VANILLA_PATH, 'utf-8');
  return JSON.parse(_vanillaRaw) as ControllerSkillSettings;
}

/**
 * @param vanillaRowNames skill name per skills.txt row, captured after the
 *   substitute overwrite but BEFORE reorderSkillsRows (i.e. vanilla row order).
 * @param idMapping old row index → new row index, from reorderSkillsRows.
 * @param substitutes dropped skills whose row now runs another skill's mechanics
 *   (includes Race Mode's Prayer filler); those rows take the source's entry.
 * @returns the file contents, compact like the vanilla file.
 */
export function buildControllerSkillSettings(
  vanillaRowNames: string[],
  idMapping: Map<number, number>,
  substitutes: SkillSubstitute[],
): string {
  const settings = loadVanillaControllerSkillSettings();
  const vanillaEntries = settings.controllerskilldata;

  const entryBySkillName = new Map<string, ControllerSkillEntry>();
  for (const e of vanillaEntries) {
    const rowName = vanillaRowNames[e.id];
    if (rowName) entryBySkillName.set(rowName, e);
  }

  // Replay the route's in-place row overwrite, in list order: each dropped row
  // copies its source row as it stands at that moment. A source that was itself
  // overwritten EARLIER passes on what it received; one overwritten LATER (Race
  // Mode turns a kept substitute's source into Prayer afterwards) does not.
  const mechanicsOf = new Map<string, string>();
  for (const sub of substitutes) {
    const source = sub.sourceSkill.skill;
    mechanicsOf.set(sub.droppedSkill.skill, mechanicsOf.get(source) ?? source);
  }

  const usedIds = new Set<number>();
  settings.controllerskilldata = vanillaEntries.map(e => {
    const rowName = vanillaRowNames[e.id];
    const source = rowName ? mechanicsOf.get(rowName) : undefined;
    const content = (source ? entryBySkillName.get(source) : undefined) ?? e;
    const id = idMapping.get(e.id) ?? e.id;
    if (usedIds.has(id)) {
      throw new Error(`controllerskillsettings: duplicate id ${id} (from vanilla row ${e.id}, ${e.name})`);
    }
    usedIds.add(id);
    // Keep the row's own name so entry names stay unique.
    return { ...content, name: e.name, id };
  });

  return JSON.stringify(settings);
}
