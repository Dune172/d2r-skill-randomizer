'use client';

import { useMemo, useState } from 'react';
import {
  AP_OPTIONS, ApOption, ApOptionValues, buildApYaml, cleanSlotName, defaultApOptions,
} from '@/lib/archipelago/options';

const GROUPS = ['Goal', 'Skill Points', 'Checks', 'The Mod', 'Experimental'] as const;

const field = 'w-full rounded border border-[#5a3a14] bg-[#140a04] px-3 py-2 text-sm text-[#e8d5a0] ' +
  'focus:outline-none focus-visible:border-[#c8942a] focus-visible:ring-1 focus-visible:ring-[#c8942a]';

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
        <input
          id={id} type="number" inputMode="numeric" min={option.min} max={option.max} value={Number(value)}
          onChange={e => onChange(Number(e.target.value))}
          onBlur={e => onChange(Math.min(option.max, Math.max(option.min, Math.round(Number(e.target.value)) || option.min)))}
          className={field}
        />
      )}
      <p className="mt-1 text-xs text-[#a89060] leading-relaxed">
        {option.help}{option.type === 'range' ? ` (${option.min}–${option.max})` : ''}
      </p>
    </div>
  );
}

export default function YamlBuilder() {
  const [name, setName] = useState('');
  const [values, setValues] = useState<ApOptionValues>(defaultApOptions);
  const [copied, setCopied] = useState(false);
  const yaml = useMemo(() => buildApYaml(name, values), [name, values]);
  const fileName = `${cleanSlotName(name) || 'Player'}.yaml`;

  const set = (key: string, value: string | number | boolean) => {
    setValues(current => ({ ...current, [key]: value }));
    setCopied(false);
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([yaml], { type: 'text/yaml' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
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
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <div className="space-y-8 min-w-0">
        <div>
          <label htmlFor="ap-name" className="block text-sm text-[#e8d5a0] mb-1">Slot name</label>
          <input
            id="ap-name" type="text" value={name} maxLength={16} placeholder="Player" autoComplete="off"
            onChange={e => { setName(e.target.value); setCopied(false); }}
            className={field}
          />
          <p className="mt-1 text-xs text-[#a89060]">Up to 16 characters. This is the name you connect with.</p>
        </div>

        {GROUPS.map(group => (
          <fieldset key={group} className={group === 'Experimental'
            ? 'rounded border border-[#7a3a1a] bg-[#2a1008]/40 p-4'
            : ''}>
            <legend className="font-cinzel text-[11px] tracking-[0.25em] uppercase text-[#c8942a] mb-3 px-1">
              {group}
            </legend>
            {group === 'Experimental' && (
              <p className="text-xs text-[#d0a070] leading-relaxed mb-4">
                Not yet confirmed in the game. Leave these off for a run that has to finish.
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

      <div className="min-w-0 lg:sticky lg:top-6 lg:self-start">
        <p className="font-cinzel text-[11px] tracking-[0.25em] uppercase text-[#c8942a] mb-2">{fileName}</p>
        <pre className="rounded border border-[#5a3a14] bg-[#0c0603] p-3 text-xs text-[#a89858] overflow-x-auto leading-relaxed">
          {yaml}
        </pre>
        <div className="mt-3 flex flex-wrap gap-3">
          <button
            type="button" onClick={download}
            className="rounded border border-[#c8942a] bg-[#3a2008] px-4 py-2 font-cinzel text-xs tracking-[0.15em] uppercase text-[#e8c060] hover:bg-[#4a2a0c] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c8942a] transition-colors"
          >
            Download YAML
          </button>
          <button
            type="button" onClick={copy}
            className="rounded border border-[#5a3a14] px-4 py-2 font-cinzel text-xs tracking-[0.15em] uppercase text-[#c8942a] hover:border-[#c8942a] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c8942a] transition-colors"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <p className="mt-3 text-xs text-[#a89060] leading-relaxed" aria-live="polite">
          Put the file in Archipelago&apos;s <code className="text-[#a89858]">Players</code> folder, or hand it to
          whoever is generating the multiworld.
        </p>
      </div>
    </div>
  );
}
