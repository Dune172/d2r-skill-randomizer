'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useRef, useEffect } from 'react';

const navLinks = [
  { href: '/generate', label: 'Generate Mod' },
  { href: '/challenge', label: 'Mutation Challenge' },
];

const communityLinks = [
  { href: 'https://discord.gg/y5r2sTxwS5', label: 'Discord Community', external: true },
  { href: 'https://ko-fi.com/dune172', label: 'Support on Ko-fi', external: true },
  { href: '/changelog', label: 'Patch Notes', external: false },
];

export default function SiteNav() {
  const pathname = usePathname();
  const [communityOpen, setCommunityOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setCommunityOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="sticky top-0 z-50 bg-[#060203]/95 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-6">
        {/* Brand — left */}
        <Link
          href="/"
          className="font-cinzel font-black tracking-[0.14em] text-xl text-[#c8942a] glow-gold uppercase hover:text-[#e0ac4a] transition-colors shrink-0"
        >
          D2R Randomizer
        </Link>

        {/* Nav links — right */}
        <nav className="flex items-center gap-1 flex-wrap justify-end">
          {navLinks.map(({ href, label }) => {
            const isActive = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`font-cinzel text-[11px] tracking-[0.3em] uppercase px-3 py-1.5 transition-colors ${
                  isActive
                    ? 'text-[#c8942a]'
                    : 'text-[#a87830] hover:text-[#c8942a]'
                }`}
              >
                {label}
              </Link>
            );
          })}

          <span className="text-[#3a1510] px-1 select-none">|</span>

          {/* Community dropdown */}
          <div ref={dropdownRef} className="relative">
            <button
              onClick={() => setCommunityOpen(o => !o)}
              className="font-cinzel text-[11px] tracking-[0.3em] uppercase px-3 py-1.5 text-[#a87830] hover:text-[#c8942a] transition-colors flex items-center gap-1"
            >
              Community
              <span className="text-[10px]">{communityOpen ? '▲' : '▼'}</span>
            </button>

            {communityOpen && (
              <div className="absolute top-full right-0 mt-1 w-52 bg-[#0e0506] border border-[#3a1510] shadow-lg z-50">
                {communityLinks.map(({ href, label, external }) => (
                  external ? (
                    <a
                      key={href}
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setCommunityOpen(false)}
                      className="block px-4 py-2.5 font-cinzel text-[10px] tracking-[0.25em] uppercase text-[#a87830] hover:text-[#c8942a] hover:bg-[#1a0a06] transition-colors"
                    >
                      {label}
                    </a>
                  ) : (
                    <Link
                      key={href}
                      href={href}
                      onClick={() => setCommunityOpen(false)}
                      className="block px-4 py-2.5 font-cinzel text-[10px] tracking-[0.25em] uppercase text-[#a87830] hover:text-[#c8942a] hover:bg-[#1a0a06] transition-colors"
                    >
                      {label}
                    </Link>
                  )
                ))}
              </div>
            )}
          </div>
        </nav>
      </div>

      {/* Bottom accent line */}
      <div className="flex items-center">
        <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[#7a5818] to-[#c8942a]" />
        <span className="text-[#c8942a] text-[8px] px-2">◆</span>
        <div className="flex-1 h-px bg-gradient-to-l from-transparent via-[#7a5818] to-[#c8942a]" />
      </div>
    </header>
  );
}
