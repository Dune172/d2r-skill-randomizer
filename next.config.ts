import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ensure data/ files are bundled into serverless functions on Vercel
  outputFileTracingIncludes: {
    '/api/preview': ['./data/**/*'],
    '/api/randomize': ['./data/**/*'],
    '/api/download': ['./data/**/*'],
  },
};

export default nextConfig;
