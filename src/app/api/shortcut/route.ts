import { NextRequest, NextResponse } from 'next/server';
import { createD2RShortcut } from '@/lib/lnk-builder';
import { normalizeInstallDir } from '@/lib/install-dir';
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

/**
 * A launch shortcut for a game installed outside the default Battle.net folder.
 *
 * The shortcut inside every ZIP points at %ProgramFiles(x86)%, and the ZIPs are cached
 * per seed and options, so a custom folder can't go into them without splitting the
 * cache. This returns just the .lnk instead: same arguments as the one in the ZIP,
 * pointed at the player's folder. Nothing is stored.
 *
 *   GET /api/shortcut?mod=seed123&seed=123&race=1&dir=D:\Games\Diablo II Resurrected
 */
export async function GET(request: NextRequest) {
  const rl = checkRateLimit(`shortcut:${getClientIp(request)}`, 30, 60_000);
  if (!rl.ok) return rateLimitResponse(rl.retryAfter);

  const p = new URL(request.url).searchParams;
  const mod = p.get('mod') ?? '';
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(mod)) {
    return NextResponse.json({ error: 'Unknown mod name.' }, { status: 400 });
  }
  const seed = Number(p.get('seed'));
  if (!Number.isInteger(seed)) {
    return NextResponse.json({ error: 'Seed must be a whole number.' }, { status: 400 });
  }
  const dir = normalizeInstallDir(p.get('dir') ?? '');
  if (!dir) {
    return NextResponse.json(
      { error: 'Enter the folder that contains D2R.exe, for example D:\\Games\\Diablo II Resurrected.' },
      { status: 400 },
    );
  }

  const lnk = createD2RShortcut(mod, seed >>> 0, p.get('race') === '1', dir);
  return new NextResponse(new Uint8Array(lnk), {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="D2R Randomizer ${seed}.lnk"`,
      'Content-Length': String(lnk.byteLength),
      'Cache-Control': 'no-store',
    },
  });
}
