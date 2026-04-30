import { NextRequest, NextResponse } from 'next/server';
import { deleteById } from '@/lib/leaderboard';

export const dynamic = 'force-dynamic';

export async function DELETE(request: NextRequest) {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const provided = request.headers.get('x-admin-token');
  if (provided !== expected) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  const id = body && typeof body === 'object' ? (body as Record<string, unknown>).id : undefined;
  if (typeof id !== 'string' || id.length === 0) {
    return NextResponse.json({ error: 'Missing id.' }, { status: 400 });
  }

  const deleted = await deleteById(id);
  return NextResponse.json({ deleted });
}
