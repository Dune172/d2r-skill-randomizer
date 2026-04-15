import { ImageResponse } from 'next/og';
import { LATEST_CHANGELOG } from '@/lib/changelog/entries';
import { OG_FONTS } from '@/lib/og/fonts';
import { OG_PALETTE } from '@/lib/og/palette';
import { OgFrame, OG_SIZE, OG_CONTENT_TYPE } from '@/lib/og/frame';

export const revalidate = 3600;
export const alt = 'D2R Randomizer — Patch Notes & Changelog';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

const { GOLD, GOLD_DIM, GOLD_DARK, GOLD_SOFT, CREAM, BORDER, BG_PANEL, PARCHMENT } = OG_PALETTE;

function BulletNote({ text }: { text: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 8 }}>
      <div
        style={{
          width: 6,
          height: 6,
          background: GOLD,
          marginTop: 10,
          transform: 'rotate(45deg)',
          display: 'flex',
        }}
      />
      <div
        style={{
          color: PARCHMENT,
          fontSize: 18,
          lineHeight: 1.5,
          display: 'flex',
        }}
      >
        {text}
      </div>
    </div>
  );
}

export default function Image() {
  const { version, date, tagline, notes } = LATEST_CHANGELOG;
  const highlights = notes.slice(0, 3);

  return new ImageResponse(
    (
      <OgFrame>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
          }}
        >
          {/* Eyebrow */}
          <div
            style={{
              color: GOLD_SOFT,
              fontSize: 18,
              letterSpacing: '0.45em',
              textTransform: 'uppercase',
              fontWeight: 700,
              marginBottom: 18,
              display: 'flex',
            }}
          >
            Patch Notes · Changelog
          </div>

          {/* Hero — site wordmark */}
          <div
            style={{
              color: GOLD,
              fontSize: 84,
              fontWeight: 900,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              textShadow: `0 0 40px ${GOLD}66`,
              lineHeight: 1,
              marginBottom: 20,
              display: 'flex',
            }}
          >
            D2R Randomizer
          </div>

          {/* Divider */}
          <div
            style={{
              width: 420,
              height: 1,
              background: GOLD_DARK,
              opacity: 0.5,
              marginBottom: 24,
              display: 'flex',
            }}
          />

          {/* Version badge row */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 18,
              marginBottom: 22,
            }}
          >
            <div
              style={{
                padding: '10px 22px',
                border: `1px solid ${GOLD_DARK}`,
                background: BG_PANEL,
                color: CREAM,
                fontSize: 24,
                fontWeight: 700,
                letterSpacing: '0.12em',
                display: 'flex',
              }}
            >
              {version}
            </div>
            <div
              style={{
                width: 8,
                height: 8,
                background: GOLD_DARK,
                transform: 'rotate(45deg)',
                display: 'flex',
              }}
            />
            <div
              style={{
                color: GOLD_DIM,
                fontSize: 18,
                letterSpacing: '0.3em',
                textTransform: 'uppercase',
                display: 'flex',
              }}
            >
              {date}
            </div>
          </div>

          {/* Tagline */}
          <div
            style={{
              color: GOLD_DIM,
              fontSize: 20,
              letterSpacing: '0.05em',
              marginBottom: 22,
              textAlign: 'center',
              display: 'flex',
            }}
          >
            {tagline}
          </div>

          {/* Highlights */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              maxWidth: 780,
              width: '100%',
              padding: '18px 24px',
              border: `1px solid ${BORDER}`,
              borderTop: `2px solid ${GOLD_DARK}`,
              background: BG_PANEL,
            }}
          >
            {highlights.map((note) => (
              <BulletNote key={note} text={note} />
            ))}
          </div>
        </div>
      </OgFrame>
    ),
    {
      ...size,
      fonts: OG_FONTS,
    }
  );
}
