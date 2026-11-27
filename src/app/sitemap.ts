import type { MetadataRoute } from 'next';
import { challengeEndDate, challengePath, pastChallenges } from '@/lib/challenge/pages';

// Hourly, so a challenge's page joins the sitemap soon after its month ends.
export const revalidate = 3600;

// lastModified is the date a page's content last changed. Bump it by hand when
// you edit a page; don't use new Date(), which would claim a change every build.
// Challenge pages use the day their challenge ended.
const BASE = 'https://d2rrandomizer.com';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: BASE, lastModified: '2026-10-26', changeFrequency: 'monthly', priority: 1 },
    { url: `${BASE}/generate`, lastModified: '2026-11-13', changeFrequency: 'monthly', priority: 0.9 },
    { url: `${BASE}/challenge`, lastModified: '2026-10-26', changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE}/guide/install`, lastModified: '2026-10-29', changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE}/faq`, lastModified: '2026-11-03', changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE}/mutations`, lastModified: '2026-11-27', changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE}/archive`, lastModified: '2026-11-27', changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE}/multiplayer`, lastModified: '2026-09-27', changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE}/changelog`, lastModified: '2026-11-27', changeFrequency: 'weekly', priority: 0.6 },
    { url: `${BASE}/about`, lastModified: '2026-11-03', changeFrequency: 'yearly', priority: 0.4 },
    { url: `${BASE}/contact`, lastModified: '2026-11-03', changeFrequency: 'yearly', priority: 0.3 },
    { url: `${BASE}/terms`, lastModified: '2026-11-03', changeFrequency: 'yearly', priority: 0.2 },
    { url: `${BASE}/privacy`, lastModified: '2026-11-03', changeFrequency: 'yearly', priority: 0.2 },
    ...pastChallenges().map((n) => ({
      url: `${BASE}${challengePath(n)}`,
      lastModified: challengeEndDate(n),
      changeFrequency: 'yearly' as const,
      priority: 0.5,
    })),
  ];
}
