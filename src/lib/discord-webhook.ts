/**
 * Fire a Discord webhook notification for a new leaderboard submission.
 * Best-effort: errors are logged but never thrown. Returns a Promise so
 * callers can `await` it (recommended in Next.js route handlers — otherwise
 * Node may abandon the in-flight fetch when the response is sent).
 * Disabled (no-op) when DISCORD_WEBHOOK_URL is unset.
 */
import { formatHMS } from './time-format';
import type { Submission } from './leaderboard';

const GOLD = 0xc8942a;
const TIMEOUT_MS = 5_000;

export async function notifyNewRun(
  sub: Submission,
  meta: { status: 'added' | 'updated'; rank: number },
): Promise<void> {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) return;

  const verb = meta.status === 'updated' ? 'Updated run' : 'New run';
  const rankLabel = meta.rank === 1 ? '#1 — Champion' : `#${meta.rank}`;

  const payload = {
    username: 'D2R Randomizer',
    embeds: [
      {
        title: `${verb} — Week ${sub.weekNumber}`,
        url: sub.proofUrl,
        color: GOLD,
        fields: [
          { name: 'Player', value: sub.name, inline: true },
          { name: 'Class', value: sub.className, inline: true },
          { name: 'Time', value: formatHMS(sub.timeSeconds), inline: true },
          { name: 'Rank', value: rankLabel, inline: true },
        ],
        timestamp: new Date(sub.submittedAt).toISOString(),
      },
    ],
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn(`[discord-webhook] HTTP ${res.status}: ${body.slice(0, 300)}`);
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.warn(`[discord-webhook] fetch failed: ${reason}`);
  } finally {
    clearTimeout(timer);
  }
}
