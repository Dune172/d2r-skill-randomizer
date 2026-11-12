'use client';

import { Tip } from '@/components/builder/FormControls';

/**
 * The game-version switch at the top of the Random Seed and Class Builder tabs.
 * On (the default) builds for Reign of the Warlock; off builds a base-game mod.
 * It is phrased as the expansion being on, so the default is the "on" position.
 */
export default function RotwSwitch({
  id,
  baseGame,
  onChange,
  offNote,
}: {
  id: string;
  /** true when the switch is off (base-game mod). */
  baseGame: boolean;
  onChange: (baseGame: boolean) => void;
  /** What turning it off leaves out, shown under the switch while it is off. */
  offNote: string;
}) {
  const on = !baseGame;
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <div className="flex items-center gap-2.5">
        <button
          id={id}
          type="button"
          role="switch"
          aria-checked={on}
          aria-describedby={`${id}-state`}
          onClick={() => onChange(on)}
          className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full border transition-colors duration-200
            focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f0c040]
            ${on ? 'bg-[#7a1010] border-[#c42020]' : 'bg-[#090203] border-[#3a1510] hover:border-[#5c2218]'}`}
        >
          <span
            aria-hidden="true"
            className={`inline-block h-3.5 w-3.5 rounded-full shadow transition-transform duration-200
              ${on ? 'translate-x-[18px] bg-[#f0c040]' : 'translate-x-[2px] bg-[#7a5030]'}`}
          />
        </button>
        <label
          htmlFor={id}
          className="font-cinzel text-[11px] tracking-[0.2em] uppercase text-[#c8a870] cursor-pointer select-none flex items-center"
        >
          Reign of the Warlock
          <Tip
            text="On: the mod is for the Reign of the Warlock expansion, with all eight classes. Turn it off if you don't own the expansion: the mod is built for the base game, so play a non-expansion character."
            width="w-64"
            below
          />
        </label>
        <span id={`${id}-state`} className={`text-[11px] ${on ? 'text-[#f0c040]' : 'text-[#7a5030]'}`}>
          {on ? 'On' : 'Off'}
        </span>
      </div>
      {baseGame && <p className="text-[11px] text-[#8a7040] italic">{offNote}</p>}
    </div>
  );
}
