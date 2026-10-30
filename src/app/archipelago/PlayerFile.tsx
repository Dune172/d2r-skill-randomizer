'use client';

import { useMemo, useRef, useState } from 'react';
import {
  AP_OPTIONS, ApOption, ApOptionValues, buildApYaml, cleanSlotName, defaultApOptions,
} from '@/lib/archipelago/options';

/** Shown up front: who you are and what finishes your game. The rest waits in "More options". */
const ESSENTIAL_GROUP = 'Goal';
const MORE_GROUPS = ['Skill Points', 'Checks', 'The Mod', 'Experimental'] as const;

const field = 'w-full rounded border border-[#5a3a14] bg-[#140a04] px-3 py-2 text-sm text-[#e8d5a0] ' +
  'focus:outline-none focus-visible:border-[#c8942a] focus-visible:ring-1 focus-visible:ring-[#c8942a]';
const label = 'block font-cinzel text-[11px] tracking-[0.22em] uppercase text-[#c8942a] mb-1.5';

/**
 * A number field whose value in the YAML is always a whole number in range. What the
 * player types stays in the field while they edit, so clearing it to type a new number
 * works; an empty or partial entry leaves the last valid value in the YAML, and leaving
 * the field shows that value again.
 */
function RangeInput({ id, min, max, value, onChange }: {
  id: string;
  min: number;
  max: number;
  value: number;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      id={id} type="number" inputMode="numeric" min={min} max={max} value={draft ?? String(value)}
      onChange={e => {
        setDraft(e.target.value);
        const n = e.target.value.trim() === '' ? NaN : Number(e.target.value);
        if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, Math.round(n))));
      }}
      onBlur={() => setDraft(null)}
      className={field}
    />
  );
}

function Control({ option, value, onChange }: {
  option: ApOption;
  value: string | number | boolean;
  onChange: (value: string | number | boolean) => void;
}) {
  const id = `ap-${option.key}`;
  if (option.type === 'toggle') {
    return (
      <label htmlFor={id} className="flex items-start gap-3 cursor-pointer">
        <input
          id={id} type="checkbox" checked={value === true}
          onChange={e => onChange(e.target.checked)}
          className="mt-1 h-4 w-4 accent-[#c8942a]"
        />
        <span>
          <span className="block text-sm text-[#e8d5a0]">{option.label}</span>
          <span className="block text-xs text-[#a89060] leading-relaxed">{option.help}</span>
        </span>
      </label>
    );
  }
  return (
    <div>
      <label htmlFor={id} className="block text-sm text-[#e8d5a0] mb-1">{option.label}</label>
      {option.type === 'choice' ? (
        <select id={id} value={String(value)} onChange={e => onChange(e.target.value)} className={field}>
          {option.choices.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      ) : (
        <RangeInput id={id} min={option.min} max={option.max} value={Number(value)} onChange={onChange} />
      )}
      <p className="mt-1 text-xs text-[#a89060] leading-relaxed">
        {option.help}{option.type === 'range' ? ` (${option.min}–${option.max})` : ''}
      </p>
    </div>
  );
}

/**
 * Step 1 of the page: the player file (an Archipelago YAML). Like the Generate page, the
 * choices are made in one panel and one red button produces the file.
 */
export default function PlayerFile() {
  const [name, setName] = useState('');
  const [values, setValues] = useState<ApOptionValues>(defaultApOptions);
  const [created, setCreated] = useState<string | null>(null);
  const [nameMissing, setNameMissing] = useState(false);
  const [copied, setCopied] = useState(false);
  const nameInput = useRef<HTMLInputElement>(null);

  const slot = cleanSlotName(name);
  const yaml = useMemo(() => buildApYaml(name, values), [name, values]);
  const fileName = `${slot || 'Player'}.yaml`;

  const changed = () => { setCreated(null); setCopied(false); };
  const set = (key: string, value: string | number | boolean) => {
    setValues(current => ({ ...current, [key]: value }));
    changed();
  };

  const create = () => {
    if (!slot) {
      setNameMissing(true);
      nameInput.current?.focus();
      return;
    }
    const url = URL.createObjectURL(new Blob([yaml], { type: 'text/yaml' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
    setCreated(fileName);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(yaml);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="ap-name" className={label}>Your name</label>
          <input
            id="ap-name" ref={nameInput} type="text" value={name} maxLength={16} placeholder="e.g. Swanny"
            autoComplete="off" aria-invalid={nameMissing && !slot}
            onChange={e => { setName(e.target.value); setNameMissing(false); changed(); }}
            className={`${field} ${nameMissing && !slot ? 'border-[#c84040]' : ''}`}
          />
          <p className={`mt-1 text-xs ${nameMissing && !slot ? 'text-[#e06060]' : 'text-[#a89060]'}`}>
            {nameMissing && !slot
              ? 'Enter a name first: it is how the room knows you.'
              : 'Up to 16 letters, numbers, spaces, - or _. You type the same name into the app to connect.'}
          </p>
        </div>
        {AP_OPTIONS.filter(o => o.group === ESSENTIAL_GROUP).map(option => (
          <Control
            key={option.key} option={option}
            value={values[option.key] ?? option.default}
            onChange={value => set(option.key, value)}
          />
        ))}
      </div>

      <details className="group rounded border border-[#2a1508]/60 bg-[#080203]/40">
        <summary className="cursor-pointer select-none px-3 py-2 font-cinzel text-[11px] tracking-[0.22em] uppercase text-[#c8942a] hover:text-[#e0ac4a]">
          More options <span className="normal-case tracking-normal text-[#a89060]">(the defaults are fine for a first game)</span>
        </summary>
        <div className="space-y-6 p-3 pt-1">
          {MORE_GROUPS.map(group => (
            <fieldset key={group} className={group === 'Experimental'
              ? 'rounded border border-[#7a3a1a] bg-[#2a1008]/40 p-4'
              : ''}>
              <legend className="font-cinzel text-[11px] tracking-[0.25em] uppercase text-[#c8942a] mb-3 px-1">
                {group}
              </legend>
              {group === 'Experimental' && (
                <p className="text-xs text-[#d0a070] leading-relaxed mb-4">
                  Horadric Keys and pooled stat points have been checked in the game in town but
                  not over a full run; traps and DeathLink are untested. Leave these off for a run that
                  has to finish.
                </p>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                {AP_OPTIONS.filter(o => o.group === group).map(option => (
                  <Control
                    key={option.key} option={option}
                    value={values[option.key] ?? option.default}
                    onChange={value => set(option.key, value)}
                  />
                ))}
              </div>
            </fieldset>
          ))}
        </div>
      </details>

      <button
        type="button" onClick={create}
        className="w-full rounded py-3
          font-cinzel font-bold tracking-[0.22em] text-sm uppercase text-[#e8d5a0]
          bg-gradient-to-b from-[#5c1010] to-[#380808]
          border border-[#8b2820]
          hover:from-[#7a1818] hover:to-[#480e0e] hover:border-[#c42020]
          transition-all duration-200
          shadow-[0_0_14px_rgba(139,40,32,0.22)] hover:shadow-[0_0_26px_rgba(196,32,32,0.38)]"
      >
        Create player file
      </button>

      <div aria-live="polite">
        {created && (
          <div className="rounded p-3 bg-[#0a2010]/60 border border-[#2a5a2a] text-sm text-[#6abf6a] leading-relaxed">
            ◆ <span className="font-semibold">{created}</span> is in your downloads. Send it to whoever is
            hosting the game, or see <a href="#host" className="underline underline-offset-4 hover:text-[#8ad08a]">Hosting a game</a> if
            that is you.
          </div>
        )}
      </div>

      <details className="text-xs">
        <summary className="cursor-pointer select-none text-[#a89060] hover:text-[#c8942a]">Show the file</summary>
        <pre className="mt-2 rounded border border-[#5a3a14] bg-[#0c0603] p-3 text-[#a89858] overflow-x-auto leading-relaxed">
          {yaml}
        </pre>
        <button
          type="button" onClick={copy}
          className="mt-2 rounded border border-[#5a3a14] px-3 py-1.5 font-cinzel text-[11px] tracking-[0.15em] uppercase text-[#c8942a] hover:border-[#c8942a] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c8942a] transition-colors"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </details>
    </div>
  );
}
