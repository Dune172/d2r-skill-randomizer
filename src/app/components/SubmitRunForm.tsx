'use client';

import { useState } from 'react';
import { MAX_RUN_SECONDS, MIN_RUN_SECONDS, parseHMS } from '@/lib/time-format';
import { isSpecificVideoUrl, VIDEO_HOSTS_LABEL } from '@/lib/video-host';
import { CLASS_NAMES, type ClassName } from '@/lib/classes';

type Props = {
  weekNumber: number;
  onSubmitted?: () => void;
};

const NAME_RE = /^[\w\s.\-']+$/u;

export function SubmitRunForm({ weekNumber, onSubmitted }: Props) {
  const [name, setName] = useState('');
  const [className, setClassName] = useState<ClassName | ''>('');
  const [hours, setHours] = useState('');
  const [minutes, setMinutes] = useState('');
  const [seconds, setSeconds] = useState('');
  const [proofUrl, setProofUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [open, setOpen] = useState(false);

  function clientValidate(): string | null {
    const trimmed = name.trim();
    if (trimmed.length < 2 || trimmed.length > 20) return 'Name must be 2–20 characters.';
    if (!NAME_RE.test(trimmed)) return 'Name can only contain letters, numbers, spaces, dot, dash, apostrophe.';
    const distinct = new Set(trimmed.toLowerCase().replace(/\s/g, '').split(''));
    if (distinct.size < 2) return 'Name needs more variety.';
    if (!className) return 'Pick a class.';
    const total = parseHMS({ h: hours, m: minutes, s: seconds });
    if (total < MIN_RUN_SECONDS) return 'Time must be at least 30 minutes.';
    if (total > MAX_RUN_SECONDS) return 'Enter a valid time.';
    const url = proofUrl.trim();
    if (url.length < 8 || url.length > 300) return 'Video link is required.';
    if (!isSpecificVideoUrl(url)) return `Video link must point to a specific video on ${VIDEO_HOSTS_LABEL}.`;
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    const err = clientValidate();
    if (err) {
      setMessage({ kind: 'err', text: err });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/leaderboard', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          weekNumber,
          name: name.trim(),
          className,
          hours: Number(hours) || 0,
          minutes: Number(minutes) || 0,
          seconds: Number(seconds) || 0,
          proofUrl: proofUrl.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ kind: 'err', text: data?.error ?? `Submit failed (${res.status}).` });
        return;
      }
      const status = data?.status as 'added' | 'updated' | 'unchanged' | undefined;
      const rank = data?.rank as number | undefined;
      const rankLabel = rank ? ` (rank #${rank})` : '';
      const text =
        status === 'added' ? `Run submitted${rankLabel}.` :
        status === 'updated' ? `New personal best${rankLabel}!` :
        status === 'unchanged' ? `Existing time was already faster — no change${rankLabel}.` :
        'Submitted.';
      setMessage({ kind: 'ok', text });
      onSubmitted?.();
      if (status === 'added' || status === 'updated') {
        setHours(''); setMinutes(''); setSeconds('');
        if (status === 'added') setClassName('');
        setOpen(false);
      }
    } catch {
      setMessage({ kind: 'err', text: 'Network error — try again.' });
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <div className="text-center space-y-3">
        {message && (
          <p
            className={`text-xs font-mono ${message.kind === 'ok' ? 'text-[#c8942a]' : 'text-[#c87650]'}`}
          >
            {message.text}
          </p>
        )}
        <button
          type="button"
          onClick={() => { setMessage(null); setOpen(true); }}
          className="font-cinzel tracking-[0.2em] uppercase text-xs px-5 py-2
            border border-[#3a1510] text-[#c8a870] hover:border-[#c8942a]/60 hover:text-[#c8942a]
            transition-colors"
        >
          Submit Your Run
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-md mx-auto text-left space-y-3" noValidate>
      <div>
        <label className="font-cinzel text-[10px] tracking-[0.32em] uppercase text-[#9a7a2a] block mb-1">
          Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={20}
          placeholder="Your name"
          className="w-full bg-[#0a0203] border border-[#3a1510] text-[#c8a870] px-3 py-2 text-sm
            focus:border-[#c8942a]/60 focus:outline-none"
          required
        />
      </div>

      <div>
        <label className="font-cinzel text-[10px] tracking-[0.32em] uppercase text-[#9a7a2a] block mb-1">
          Class
        </label>
        <select
          value={className}
          onChange={(e) => setClassName(e.target.value as ClassName | '')}
          className="w-full bg-[#0a0203] border border-[#3a1510] text-[#c8a870] px-3 py-2 text-sm
            focus:border-[#c8942a]/60 focus:outline-none"
          required
        >
          <option value="" disabled>Select a class…</option>
          {CLASS_NAMES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="font-cinzel text-[10px] tracking-[0.32em] uppercase text-[#9a7a2a] block mb-1">
          Time to Beat Baal (Normal)
        </label>
        <div className="flex gap-2">
          <TimeInput value={hours} setValue={setHours} max={168} suffix="h" />
          <TimeInput value={minutes} setValue={setMinutes} max={59} suffix="m" />
          <TimeInput value={seconds} setValue={setSeconds} max={59} suffix="s" />
        </div>
      </div>

      <div>
        <label className="font-cinzel text-[10px] tracking-[0.32em] uppercase text-[#9a7a2a] block mb-1">
          Video Link <span className="text-[#7a5818] normal-case tracking-normal">(YouTube, Twitch, etc.)</span>
        </label>
        <input
          type="url"
          value={proofUrl}
          onChange={(e) => setProofUrl(e.target.value)}
          maxLength={300}
          placeholder="https://youtu.be/..."
          className="w-full bg-[#0a0203] border border-[#3a1510] text-[#c8a870] px-3 py-2 text-sm
            focus:border-[#c8942a]/60 focus:outline-none"
          required
        />
      </div>

      <div className="flex items-center justify-center gap-5 pt-2">
        <button
          type="submit"
          disabled={submitting}
          className="font-cinzel tracking-[0.2em] uppercase text-xs px-5 py-2
            bg-gradient-to-b from-[#382010] to-[#1a0c06]
            border border-[#c8942a]/60 text-[#c8942a]
            hover:from-[#4a2a14] hover:to-[#221008] hover:border-[#c8942a]
            disabled:opacity-50 disabled:cursor-not-allowed
            transition-colors"
        >
          {submitting ? 'Submitting…' : 'Submit Run'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="font-cinzel tracking-[0.2em] uppercase text-xs text-[#7a5818] hover:text-[#c8942a] transition-colors"
        >
          Cancel
        </button>
      </div>

      {message && (
        <p
          className={`text-xs font-mono text-center ${message.kind === 'ok' ? 'text-[#c8942a]' : 'text-[#c87650]'}`}
        >
          {message.text}
        </p>
      )}
    </form>
  );
}

function TimeInput({
  value,
  setValue,
  max,
  suffix,
}: {
  value: string;
  setValue: (v: string) => void;
  max: number;
  suffix: string;
}) {
  return (
    <div className="flex-1 flex items-stretch border border-[#3a1510] bg-[#0a0203] focus-within:border-[#c8942a]/60">
      <input
        type="number"
        inputMode="numeric"
        min={0}
        max={max}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="0"
        className="flex-1 min-w-0 bg-transparent text-[#c8a870] px-3 py-2 text-sm focus:outline-none tabular-nums"
      />
      <span className="self-center pr-3 text-[#7a5818] text-xs font-mono">{suffix}</span>
    </div>
  );
}
