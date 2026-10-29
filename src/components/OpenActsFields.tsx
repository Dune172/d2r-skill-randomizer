'use client';

import { useEffect, useState } from 'react';
import { ActPillRow, Checkbox, Tip } from './builder/FormControls';
import {
  OPEN_ACT_CHOICES,
  isValidCharacterName,
  normalizeOpenActs,
  starterName,
  toggleActLadder,
  type OpenAct,
  type OpenActsSettings,
} from '@/lib/randomizer/open-acts/options';

/**
 * The Open Acts options, shared by the seed generator and the Class Builder: the
 * quest-item shuffle with its sub-options, the acts that start open, and the starter
 * characters' hardcore flag and name.
 */
export default function OpenActsFields({
  value,
  onChange,
  raceMode = false,
}: {
  value: OpenActsSettings;
  onChange: (next: OpenActsSettings) => void;
  /** Race Mode ships one starter, which takes the typed name as is. */
  raceMode?: boolean;
}) {
  const update = (patch: Partial<OpenActsSettings>) => onChange(normalizeOpenActs({ ...value, ...patch }, raceMode));

  // The typed name is kept while it is invalid; only a valid one (or none) is applied.
  const [draft, setDraft] = useState(value.name);
  useEffect(() => {
    setDraft(d => (value.name !== (isValidCharacterName(d) ? d : '') ? value.name : d));
  }, [value.name]);
  const nameInvalid = draft !== '' && !isValidCharacterName(draft);
  const example = value.name
    ? (raceMode ? value.name : ['Sorceress', 'Paladin'].map(c => starterName(value.name, c, false)).join(', ') + ', …')
    : null;

  const highest = value.acts[value.acts.length - 1] ?? 1;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
      {/* Left: quest-item shuffle */}
      <div className="flex flex-col justify-start gap-3">
        <Checkbox
          id="shuffleQuests"
          checked={value.shuffle}
          onChange={v => update({ shuffle: v })}
          label="Shuffle quest items (experimental)"
          tooltip="Moves the Scroll of Inifuss, the Horadric Cube, the Staff of Kings and Khalim's Eye, Brain and Heart to new spots across Acts I–III. Every seed is checked to be beatable. Works with any new character, or with open acts."
        />
        {value.shuffle && (
          <div className="ml-1 pl-3 border-l-2 border-[#7a1010]/60 flex flex-col gap-2">
            <Checkbox
              id="questBosses"
              checked={value.bosses}
              onChange={v => update({ bosses: v })}
              label="Bosses can hold quest items"
              tooltip="Blood Raven, Andariel, Griswold, Radament, the Summoner, Duriel, Battlemaid Sarina and Icehawk Riftwing can carry a quest item. It drops on every kill, so a lost item can be farmed again."
            />
            <Checkbox
              id="questHints"
              checked={value.hints}
              onChange={v => update({ hints: v })}
              label="Quest-log hints"
              tooltip="The quest log says which act each item is in, e.g. “Khalim's Eye is somewhere in Act I.” Turn off to search with no hints."
            />
            <Checkbox
              id="questSpoiler"
              checked={value.spoiler}
              onChange={v => update({ spoiler: v })}
              label="Spoiler file"
              tooltip="Adds quest-shuffle.json to the mod folder, listing the exact spot of every item. Off by default in Race Mode, which keeps spoilers hidden."
            />
          </div>
        )}
      </div>

      {/* Right: acts open from the start, and the starter characters */}
      <div className="flex flex-col justify-start">
        <span className="text-sm text-[#c8a870] flex items-center">
          Start with acts open
          <Tip text="Ships level-1 starter characters whose waypoint and quest tabs for these acts are already open, in every difficulty. Copy them into your save folder (the install steps show where) and play one of them: a character you create in game starts with only Act I open. Each act opens together with the ones before it." />
        </span>
        <ActPillRow
          acts={OPEN_ACT_CHOICES}
          selected={value.acts}
          onToggle={act => update({ acts: toggleActLadder(value.acts, act as OpenAct) })}
        />
        {value.acts.length > 0 && (
          <div className="ml-1 pl-3 border-l-2 border-[#7a1010]/60 mt-2 flex flex-col gap-2">
            <Checkbox
              id="starterHardcore"
              checked={value.hardcore}
              onChange={v => update({ hardcore: v })}
              label="Hardcore starters"
              tooltip="The starter characters are hardcore: one death and they're gone. Keep a copy of the .d2s files to start over."
            />
            <label htmlFor="starterName" className="text-sm text-[#c8a870] flex flex-wrap items-center gap-2">
              <span className="flex items-center">
                Starter name
                <Tip text={raceMode
                  ? 'Name of your starter character (2–15 letters, at most one - or _). Leave empty to use the class name.'
                  : 'Your starter characters get this name plus a class tag, e.g. Swanny-Sorc, so the eight saves don’t collide. 2–15 letters, at most one - or _. Leave empty to use the class names. With friends, each player can generate the seed with their own name.'} />
              </span>
              <input
                id="starterName"
                type="text"
                value={draft}
                maxLength={15}
                placeholder="Class name"
                autoComplete="off"
                spellCheck={false}
                onChange={e => {
                  const v = e.target.value.replace(/\s/g, '');
                  setDraft(v);
                  update({ name: isValidCharacterName(v) ? v : '' });
                }}
                className={`w-36 rounded border bg-[#090203] px-2 py-1 text-sm text-[#e8d5a0] placeholder:text-[#5a4028]
                  focus:outline-none focus:ring-1 transition-colors
                  ${nameInvalid ? 'border-[#c42020] focus:ring-[#c42020]/40' : 'border-[#3a1510] focus:border-[#7a3020] focus:ring-[#7a3020]/40'}`}
              />
            </label>
            {nameInvalid && (
              <p className="text-xs text-[#e07050]">
                Use 2–15 letters with at most one - or _ (not at the start or end). Until then the class names are used.
              </p>
            )}
            {example && !nameInvalid && <p className="text-xs text-[#7a7858]">Saves: {example}</p>}
          </div>
        )}
        {value.acts.length > 0 && (
          <p className="mt-2 ml-1 pl-3 border-l-2 border-[#c42020]/70 text-xs text-[#e0a070] leading-relaxed">
            Play one of the included starter characters.
            {value.shuffle && value.acts.includes(3)
              ? ' The shuffle counts on these acts being open, so a character you create in game will usually get stuck before Duriel.'
              : ' A character you create in game starts with only Act I open.'}
            {highest >= 4 && ' Acts IV and V hold no quest items: opening them lets you skip ahead'}
            {highest >= 4 && (raceMode ? ', so in a race everyone can head straight there.' : '.')}
            {highest >= 5 && ' Opening Act V marks Terror’s End (Diablo) as done, as the game requires; Diablo can still be fought.'}
          </p>
        )}
      </div>
    </div>
  );
}
