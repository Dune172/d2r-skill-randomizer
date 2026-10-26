import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Page Not Found',
  robots: { index: false },
};

const links = [
  { href: '/', label: 'Home' },
  { href: '/generate', label: 'Generate a mod' },
  { href: '/guide/install', label: 'Install guide' },
  { href: '/faq', label: 'FAQ' },
];

export default function NotFound() {
  return (
    <main className="min-h-[60vh] flex items-center">
      <section className="max-w-xl mx-auto px-4 py-16 text-center">
        <p className="font-cinzel text-[10px] tracking-[0.4em] text-[#8a7040] uppercase mb-3">Error 404</p>
        <h1 className="font-cinzel font-black tracking-[0.12em] text-3xl md:text-4xl text-[#c8942a] glow-gold uppercase mb-4">
          Lost in the Maze
        </h1>
        <p className="text-sm text-[#a89060] leading-relaxed mb-8">
          This page doesn&apos;t exist, or it moved. Try one of these instead.
        </p>
        <ul className="flex flex-wrap justify-center gap-3">
          {links.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                className="inline-block font-cinzel tracking-[0.15em] uppercase text-xs px-4 py-2 border border-[#c8942a]/40 text-[#c8942a] hover:bg-[#1a0a06] transition-colors"
              >
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
