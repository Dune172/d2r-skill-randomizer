import type { ReactNode } from 'react';
import Link from 'next/link';

/**
 * Shared shell for text pages (guides, FAQ, About, Terms). Child markup gets
 * consistent typography from the descendant selectors below, so pages can use
 * plain <h2>, <h3>, <p>, <ul>, <ol>, <a> and <code>.
 */
export default function ContentPage({
  eyebrow,
  title,
  intro,
  updated,
  children,
  related,
}: {
  eyebrow?: string;
  title: string;
  intro?: ReactNode;
  /** ISO date (YYYY-MM-DD) of the last content change, shown to readers. */
  updated: string;
  children: ReactNode;
  /** Links shown at the bottom under "Keep reading". */
  related?: { href: string; label: string }[];
}) {
  const updatedLabel = new Date(`${updated}T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });

  return (
    <main className="min-h-screen">
      <article className="max-w-2xl mx-auto px-4 pt-12 pb-16">
        {eyebrow && (
          <p className="font-cinzel text-[10px] tracking-[0.4em] text-[#8a7040] uppercase mb-3">{eyebrow}</p>
        )}
        <h1 className="font-cinzel font-black tracking-[0.12em] text-3xl md:text-4xl text-[#c8942a] glow-gold uppercase mb-3 text-balance">
          {title}
        </h1>
        <p className="text-xs text-[#8a7040] mb-8">
          Last updated <time dateTime={updated}>{updatedLabel}</time>
        </p>

        {intro && <div className="text-base text-[#e8d5a0] leading-relaxed mb-10 text-pretty">{intro}</div>}

        <div
          className="text-sm text-[#e8d5a0]/90 leading-relaxed text-pretty
            [&_h2]:font-cinzel [&_h2]:font-bold [&_h2]:text-[#c8942a] [&_h2]:text-lg [&_h2]:tracking-[0.08em] [&_h2]:mt-12 [&_h2]:mb-4 [&_h2]:text-balance [&_h2]:scroll-mt-24
            [&_h3]:font-cinzel [&_h3]:font-semibold [&_h3]:text-[#e8c87a] [&_h3]:tracking-[0.05em] [&_h3]:mt-7 [&_h3]:mb-2 [&_h3]:scroll-mt-24
            [&_p]:mb-4
            [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-2 [&_ul]:mb-5
            [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-3 [&_ol]:mb-5
            [&_a]:text-[#c8942a] [&_a]:underline [&_a]:underline-offset-4 hover:[&_a]:text-[#e0ac4a]
            [&_code]:text-[#a89858] [&_code]:break-all
            [&_strong]:text-[#e8c87a] [&_strong]:font-semibold"
        >
          {children}
        </div>

        {related && related.length > 0 && (
          <nav aria-label="Related pages" className="mt-14 pt-8 border-t border-[#1a0a06]">
            <p className="font-cinzel text-[10px] tracking-[0.35em] uppercase text-[#8a7040] mb-4">Keep reading</p>
            <ul className="flex flex-wrap gap-3">
              {related.map((r) => (
                <li key={r.href}>
                  <Link
                    href={r.href}
                    className="inline-block font-cinzel tracking-[0.15em] uppercase text-xs px-4 py-2 border border-[#c8942a]/40 text-[#c8942a] hover:bg-[#1a0a06] transition-colors"
                  >
                    {r.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </article>
    </main>
  );
}

/** Builds page metadata the same way the existing guide pages do. */
export function contentMetadata(path: string, title: string, description: string) {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { title, description, url: path },
    twitter: { card: 'summary_large_image' as const, title, description },
  };
}
