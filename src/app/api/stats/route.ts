import { NextRequest, NextResponse } from 'next/server';
import { getStats } from '@/lib/traffic-stats';
import { getCount } from '@/lib/counter';

export const dynamic = 'force-dynamic';

// Public read-only traffic attribution summary (daily aggregates only — see
// src/lib/traffic-stats.ts; nothing sensitive). CORS is open so the marketing
// dashboard can read it cross-origin.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Cache-Control': 'no-store',
};

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const daysParam = Number(url.searchParams.get('days') ?? 30);
  const days = Number.isFinite(daysParam) ? Math.min(Math.max(Math.floor(daysParam), 1), 366) : 30;
  return NextResponse.json(
    { ...getStats(days), generations: getCount() },
    { headers: CORS_HEADERS },
  );
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
