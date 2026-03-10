import { NextResponse } from 'next/server';
import { getCount } from '@/lib/counter';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ count: getCount() });
}
