import { ImageResponse } from 'next/og';
import { getCurrentWeekNumber, getWeekStart, getWeekEnd, getWeekSeed, formatWeekDate } from '@/lib/challenge/week';

export const runtime = 'edge';
export const alt = 'D2R Randomizer — Weekly Challenge Seed';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

function getCurrentChallenge() {
  const weekNumber = getCurrentWeekNumber();
  const seed = getWeekSeed(weekNumber);
  const start = getWeekStart(weekNumber);
  const end = getWeekEnd(weekNumber);
  return { weekNumber, seed, dateRange: `${formatWeekDate(start)} – ${formatWeekDate(end)}` };
}

export default function Image() {
  const { weekNumber, seed, dateRange } = getCurrentChallenge();

  return new ImageResponse(
    (
      <div
        style={{
          background: '#080204',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 0,
          padding: '60px',
        }}
      >
        {/* Top label */}
        <div style={{ color: '#7a5818', fontSize: 18, letterSpacing: '0.35em', textTransform: 'uppercase', marginBottom: 20 }}>
          Weekly Challenge · Week {weekNumber} · {dateRange}
        </div>

        {/* Site title */}
        <div style={{ color: '#c8942a', fontSize: 38, fontWeight: 900, letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 28 }}>
          D2R Randomizer
        </div>

        {/* Divider */}
        <div style={{ width: '480px', height: '1px', background: '#c8942a', opacity: 0.35, marginBottom: 36 }} />

        {/* Seed number — the hero */}
        <div
          style={{
            color: '#c8942a',
            fontSize: 96,
            fontWeight: 900,
            letterSpacing: '0.1em',
            textShadow: '0 0 40px rgba(200,148,42,0.6), 0 0 80px rgba(200,148,42,0.3)',
          }}
        >
          {seed.toLocaleString()}
        </div>

        {/* Subtitle */}
        <div style={{ color: '#a87830', fontSize: 22, letterSpacing: '0.25em', textTransform: 'uppercase', marginTop: 28 }}>
          This Week&apos;s Seed · d2rrandomizer.com
        </div>
      </div>
    ),
    { ...size }
  );
}
