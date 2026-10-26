import type { MetadataRoute } from 'next';

// lastModified is the date a page's content last changed. Bump it by hand when
// you edit a page; don't use new Date(), which would claim a change every build.
const BASE = 'https://d2rrandomizer.com';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: BASE, lastModified: '2026-10-26', changeFrequency: 'monthly', priority: 1 },
    { url: `${BASE}/generate`, lastModified: '2026-10-26', changeFrequency: 'monthly', priority: 0.9 },
    { url: `${BASE}/challenge`, lastModified: '2026-10-26', changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE}/guide/install`, lastModified: '2026-10-26', changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE}/faq`, lastModified: '2026-10-26', changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE}/mutations`, lastModified: '2026-10-26', changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE}/archive`, lastModified: '2026-10-01', changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE}/multiplayer`, lastModified: '2026-09-27', changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE}/changelog`, lastModified: '2026-10-26', changeFrequency: 'weekly', priority: 0.6 },
    { url: `${BASE}/about`, lastModified: '2026-10-26', changeFrequency: 'yearly', priority: 0.4 },
    { url: `${BASE}/contact`, lastModified: '2026-10-26', changeFrequency: 'yearly', priority: 0.3 },
    { url: `${BASE}/terms`, lastModified: '2026-10-26', changeFrequency: 'yearly', priority: 0.2 },
    { url: `${BASE}/privacy`, lastModified: '2026-10-26', changeFrequency: 'yearly', priority: 0.2 },
  ];
}
