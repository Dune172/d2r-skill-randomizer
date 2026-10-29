import fs from 'fs';
import path from 'path';
import { CLASS_DEFS } from '../config';
import { applyOpenActsShuffle, hostModes, type OpenActsTables, type Table } from './apply';
import { shuffleOpenActs, type OpenActsShuffle } from './fill';
import { applyHints, hintStrings, neutralStrings, type QuestString } from './hints';
import { openActsLabel, starterName, type OpenActsSettings } from './options';
import { patchStarterSave, startSkillSlot } from './starter-save';

/**
 * Generator glue for Open Acts (Node only). The route calls runOpenActsShuffle in the
 * table phase, then buildOpenActsFiles once the mod's skills and charstats are final.
 */

/** Shuffle and write the result into the tables. Null when the shuffle is off. */
export function runOpenActsShuffle(
  seed: number, settings: OpenActsSettings, startWithCube: boolean, tables: OpenActsTables,
): OpenActsShuffle | null {
  if (!settings.shuffle) return null;
  const shuffle = shuffleOpenActs(seed, {
    startWithCube, bossLocations: settings.bosses, openActs: settings.acts,
  }, hostModes(tables.objects));
  applyOpenActsShuffle(shuffle, tables);
  return shuffle;
}

export interface OpenActsFilesInput {
  dataDir: string;
  seed: number;
  modName: string;
  savepath: string;
  settings: OpenActsSettings;
  shuffle: OpenActsShuffle | null;
  startWithCube: boolean;
  /** Race Mode ships only this class's starter (CLASS_DEFS code), otherwise all eight. */
  raceClassCode: string | null;
  charstats: Table;
  skills: Table;
}

export interface OpenActsFiles {
  /** quests.json with the hint (or neutral) lines; only with the shuffle. */
  questsJson?: string;
  /** quest-shuffle.json for the mod folder; only with the shuffle and spoiler on. */
  spoilerJson?: string;
  /** File name → patched starter character; only when acts start open. */
  starterSaves?: Map<string, Buffer>;
  starterReadme?: string;
}

export function buildOpenActsFiles(input: OpenActsFilesInput): OpenActsFiles {
  const { settings, shuffle } = input;
  const files: OpenActsFiles = {};

  if (shuffle) {
    const raw = fs.readFileSync(path.join(input.dataDir, 'local', 'strings', 'quests.json'), 'utf-8');
    const entries = JSON.parse(raw.replace(/^﻿/, '')) as QuestString[];
    applyHints(entries, settings.hints ? hintStrings(shuffle.manifest) : neutralStrings(input.startWithCube));
    // Same layout as the game's file: BOM, CRLF, 2-space indent.
    files.questsJson = '﻿' + JSON.stringify(entries, null, 2).replace(/\n/g, '\r\n');
    if (settings.spoiler) {
      files.spoilerJson = JSON.stringify({
        seed: input.seed,
        openActs: settings.acts,
        bossesHoldItems: settings.bosses,
        startWithCube: input.startWithCube,
        playthrough: shuffle.manifest.map(m => ({
          sphere: m.sphere, item: m.itemName, key: m.key, act: m.act, location: m.locationName,
        })),
      }, null, 2);
    }
  }

  if (settings.acts.length) {
    const classCol = input.charstats.headers.indexOf('class');
    const startCol = input.charstats.headers.indexOf('StartSkill');
    if (classCol < 0 || startCol < 0) throw new Error('open-acts: charstats.txt has no class/StartSkill column');
    const classes = input.raceClassCode
      ? CLASS_DEFS.filter(d => d.code === input.raceClassCode)
      : CLASS_DEFS;
    const saves = new Map<string, Buffer>();
    for (const def of classes) {
      const template = path.join(input.dataDir, 'starter-saves', `${def.name.toLowerCase()}${input.startWithCube ? '-cube' : ''}.d2s`);
      const row = input.charstats.rows.find(r => r[classCol] === def.name);
      if (!row) throw new Error(`open-acts: charstats.txt has no ${def.name}`);
      const slot = startSkillSlot(input.skills.headers, input.skills.rows, def.charclass, row[startCol]);
      // The file name must match the name inside the save.
      const name = starterName(settings.name, def.name, classes.length === 1);
      saves.set(`${name}.d2s`, patchStarterSave(fs.readFileSync(template), {
        name, startSkillSlot: slot, openActs: settings.acts, hardcore: settings.hardcore,
      }));
    }
    files.starterSaves = saves;
    const opened = openActsLabel(settings.acts);
    files.starterReadme = [
      'D2R Randomizer - Open Acts starter characters',
      '',
      `These level-1 ${settings.hardcore ? 'HARDCORE ' : ''}characters start with ${opened} already open`,
      '(waypoint and quest tabs), in Normal, Nightmare and Hell.',
      'They are built for this seed: load them only with this mod.',
      ...(settings.hardcore ? ['Hardcore: a character that dies stays dead. Keep a backup copy of these files.'] : []),
      '',
      'To install, copy the .d2s files from this folder to:',
      `  %USERPROFILE%\\Saved Games\\Diablo II Resurrected\\mods\\${input.savepath}\\`,
      '',
      `Create the "${input.savepath}" folder if it does not exist yet (or launch the mod once).`,
      'Then start the mod and pick the character from the list.',
      '',
      'PLAY ONE OF THESE CHARACTERS. A character you create yourself in this mod starts with',
      'only Act I open.',
      ...(shuffle && settings.acts.includes(3) ? [
        'The quest items are shuffled on the assumption that these acts are open, so such a',
        'character will usually get stuck before Duriel: the items it needs can be in Act III.',
      ] : []),
      '',
    ].join('\r\n');
  }
  return files;
}
