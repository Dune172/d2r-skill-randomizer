import { adsense } from '@/lib/adsense';

export const dynamic = 'force-static';

export function GET() {
  if (!adsense.clientId) {
    return new Response('AdSense publisher is not configured.\n', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
  return new Response(`google.com, ${adsense.clientId.slice(3)}, DIRECT, f08c47fec0942fa0\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });
}
