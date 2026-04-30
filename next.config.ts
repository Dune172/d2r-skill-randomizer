import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    cpus: 2,
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
    ];
  },
};

export default nextConfig;
