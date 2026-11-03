'use client';

import { useEffect, useState } from 'react';
import { DEFAULT_INSTALL_DIR, normalizeInstallDir } from '@/lib/install-dir';

const STORAGE_KEY = 'd2rr.installDir';

/**
 * "Game installed somewhere else?" — the ZIP's shortcut points at the default Battle.net
 * folder, so this offers the same shortcut pointed at the player's own folder
 * (/api/shortcut). The folder is remembered in this browser only.
 */
export function CustomShortcut({ mod, seed, raceMode }: { mod: string; seed: number; raceMode: boolean }) {
  const [dir, setDir] = useState('');

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) setDir(saved);
    } catch { /* storage blocked: start empty */ }
  }, []);

  const clean = normalizeInstallDir(dir);
  const isDefault = clean?.toLowerCase() === DEFAULT_INSTALL_DIR.toLowerCase();
  const href = clean
    ? `/api/shortcut?mod=${encodeURIComponent(mod)}&seed=${seed}&race=${raceMode ? 1 : 0}&dir=${encodeURIComponent(clean)}`
    : null;

  const remember = () => {
    if (!clean) return;
    try { window.localStorage.setItem(STORAGE_KEY, clean); } catch { /* not remembered */ }
  };

  return (
    <details className="mt-1.5 group" open={!!dir || undefined}>
      <summary className="cursor-pointer text-[#7a7858] hover:text-[#c8a870] select-none">
        Game installed somewhere else?
      </summary>
      <div className="mt-1.5 space-y-1.5">
        <label htmlFor={`installDir-${mod}`} className="block text-[#7a7858]">
          The included shortcut only works in the default folder. Paste the folder that holds{' '}
          <code className="text-[#a89858]">D2R.exe</code> to get a shortcut for yours:
        </label>
        <input
          id={`installDir-${mod}`}
          type="text"
          value={dir}
          onChange={e => setDir(e.target.value)}
          placeholder="D:\Games\Diablo II Resurrected"
          spellCheck={false}
          autoComplete="off"
          className="w-full rounded border border-[#3a1510] bg-[#090203] px-2 py-1.5 text-xs text-[#e8d5a0]
            placeholder:text-[#4a3a28] focus:outline-none focus:border-[#7a3020] focus:ring-1 focus:ring-[#7a3020]/40"
        />
        {dir.trim() && !clean && (
          <p className="text-[#e0a070]">That doesn&apos;t look like a folder path. It should start with a drive letter, like <code>D:\</code>.</p>
        )}
        {isDefault && (
          <p className="text-[#7a7858]">That&apos;s the default folder. The shortcut in the ZIP already works there.</p>
        )}
        {href && !isDefault && (
          <a
            href={href}
            download={`D2R Randomizer ${seed}.lnk`}
            onClick={remember}
            className="inline-block rounded border border-[#c8942a]/60 px-2.5 py-1 text-[#c8942a] hover:bg-[#c8942a]/10 hover:text-[#e0ac4a]"
          >
            Download shortcut for this folder
          </a>
        )}
        {href && !isDefault && (
          <p className="text-[#7a7858]">Use it in place of the one in the ZIP. You still copy the mod folder into <code className="text-[#a89858]">{clean!.replace(/\\$/, '')}\mods\</code>.</p>
        )}
      </div>
    </details>
  );
}
