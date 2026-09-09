import { NextResponse } from 'next/server';
import { getCount } from '@/lib/counter';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(
    { count: getCount() },
    {
      // A global "mods generated" total, fetched on mount by every visitor to
      // /generate and again after each build. Nobody can tell a 60s-old count
      // from a live one, and leaving it uncacheable cost an origin hit per page
      // view for a single integer.
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
    },
  );
}
