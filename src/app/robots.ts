import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Unlisted until the Archipelago integration is released: nothing links to it, it is
      // absent from sitemap.ts, and the page also sets noindex.
      disallow: ['/archipelago'],
    },
    sitemap: 'https://d2rrandomizer.com/sitemap.xml',
  };
}
