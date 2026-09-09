import type { NextConfig } from "next";

// Cache policy for the two hot HTML pages.
//
// `max-age=0, must-revalidate` keeps the original guarantee: a browser never
// reuses homepage HTML without checking first, so a stale HTML + fresh JS chunk
// pair can't show the wrong week's name. Conditional GETs answer 304 and cost
// almost nothing.
//
// `s-maxage` / `stale-while-revalidate` are the new part. Previously this was a
// bare `no-cache`, which shared caches also honour — so every homepage view was
// a DYNAMIC, uncached origin hit at the CDN (confirmed by
// `x-hcdn-cache-status: DYNAMIC` on `GET /`). With Cloudflare speculation rules
// enabled on the zone, browsers prefetch `/` on top of real visits, and the
// resulting dynamic-request volume is what pushed the site into the host's
// rate limit and produced 429s. Letting the CDN hold the page for 60s (and
// serve it while revalidating for another 5 minutes) collapses that to roughly
// one origin hit per minute per edge location, while the browser-side
// revalidation guarantee is unchanged.
const HTML_CACHE_CONTROL =
  'public, max-age=0, must-revalidate, s-maxage=60, stale-while-revalidate=300';

const nextConfig: NextConfig = {
  experimental: {
    cpus: 2,
  },
  async headers() {
    return [
      {
        source: '/generate',
        headers: [
          { key: 'Cache-Control', value: HTML_CACHE_CONTROL },
        ],
      },
      {
        source: '/',
        headers: [
          { key: 'Cache-Control', value: HTML_CACHE_CONTROL },
        ],
      },
      {
        // Spoiler skill icons. Content-addressed by class + IconCel under a
        // versioned path, so the bytes behind a URL never change — pin them
        // forever rather than revalidating 240 tiles on every spoiler expand.
        // Bump the /v1/ segment (and SKILL_ICON_VERSION) if the tiles change.
        source: '/skill-icons/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ];
  },
};

export default nextConfig;
