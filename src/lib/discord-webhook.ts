/**
 * Fire a Discord webhook notification for a new leaderboard submission.
 * Best-effort and fire-and-forget — never throws, never blocks the API response.
 * Disabled (no-op) when DISCORD_WEBHOOK_URL is unset.
 */
import { formatHMS } from './time-format';
import type { Submission } from './leaderboard';

const GOLD = 0xc8942a;

export function notifyNewRun(
  sub: Submission,
  meta: { status: 'added' | 'updated'; rank: number },
): void {
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

  // Fire-and-forget. Swallow all errors so a bad webhook never breaks /api/leaderboard.
  fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => {});
}
