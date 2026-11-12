import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // /archipelago only redirects to the Generate page's Archipelago tab now; this keeps
      // crawlers off the redirect and the app download (/archipelago/d2rr-ap.exe) beside it.
      disallow: ['/archipelago'],
    },
    sitemap: 'https://d2rrandomizer.com/sitemap.xml',
  };
}
