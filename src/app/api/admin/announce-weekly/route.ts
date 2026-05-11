/**
 * Manual trigger for the Discord weekly-challenge announcement. Gated by an
 * ADMIN_TOKEN header so it can't be hit anonymously. Does NOT update the
 * persisted lastAnnouncedWeek, so it won't suppress the real Monday post.
 *
 *   POST /api/admin/announce-weekly
 *   POST /api/admin/announce-weekly?week=5
 *   Header: x-admin-token: <ADMIN_TOKEN>
 */
import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentWeekNumber } from '@/lib/challenge/week';
import { postWeeklyAnnouncement } from '@/lib/discord-weekly-announcer';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const token = process.env.ADMIN_TOKEN;
  if (!token) {
    return new NextResponse('Not Found', { status: 404 });
  }
  if (req.headers.get('x-admin-token') !== token) {
    return new NextResponse('Not Found', { status: 404 });
  }

  const weekParam = req.nextUrl.searchParams.get('week');
  let week = getCurrentWeekNumber();
  if (weekParam !== null) {
    const parsed = Number.parseInt(weekParam, 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      return NextResponse.json({ error: 'invalid week' }, { status: 400 });
    }
    week = parsed;
  }

  const ok = await postWeeklyAnnouncement(week);
  return NextResponse.json({ ok, week });
}
