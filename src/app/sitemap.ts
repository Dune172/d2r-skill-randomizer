import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: 'https://d2rrandomizer.com',
      lastModified: '2026-04-07',
      changeFrequency: 'monthly',
      priority: 1,
    },
    {
      url: 'https://d2rrandomizer.com/generate',
      lastModified: '2026-04-07',
      changeFrequency: 'monthly',
      priority: 0.9,
    },
    {
      url: 'https://d2rrandomizer.com/challenge',
      lastModified: '2026-04-07',
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: 'https://d2rrandomizer.com/changelog',
      lastModified: '2026-04-07',
      changeFrequency: 'weekly',
      priority: 0.6,
    },
  ];
}
