import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    cpus: 2,
  },
  async redirects() {
    return [
      {
        // The Archipelago page became a toggle on /generate. The app's "out of date"
        // message, the apworld's setup guide and the release notes link here, so the
        // old address keeps working.
        source: '/archipelago',
        destination: '/generate?mode=archipelago',
        permanent: false,
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/generate',
        headers: [
          { key: 'Cache-Control', value: 'no-cache' },
        ],
      },
      {
        // Force browsers to revalidate the homepage on every visit. The weekly
        // challenge card is rendered into HTML and the WEEK_NAMES rotation can
        // be reordered by deploys, so a cached HTML+JS chunk pair can show the
        // wrong week's name. Conditional GETs return 304 when ISR has nothing
        // new, so the bandwidth cost is negligible.
        source: '/',
        headers: [
          { key: 'Cache-Control', value: 'no-cache' },
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
