import { ImageResponse } from 'next/og';
import { OG_FONTS } from '@/lib/og/fonts';
import { OG_PALETTE } from '@/lib/og/palette';
import { OgFrame, OG_SIZE, OG_CONTENT_TYPE } from '@/lib/og/frame';

export const revalidate = 3600;
export const alt = 'D2R Randomizer — Generate Your Mod';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

const { GOLD, GOLD_DIM, GOLD_DARK, GOLD_SOFT, CREAM, BORDER, BG_PANEL } = OG_PALETTE;

function SeedBadge() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '16px 34px',
        background: BG_PANEL,
        border: `1px solid ${BORDER}`,
        borderTop: `2px solid ${GOLD_DARK}`,
      }}
    >
      <div
        style={{
          color: GOLD_SOFT,
          fontSize: 14,
          letterSpacing: '0.4em',
          textTransform: 'uppercase',
          marginRight: 18,
          display: 'flex',
        }}
      >
        Seed
      </div>
      <div
        style={{
          width: 1,
          height: 26,
          background: GOLD_DARK,
          marginRight: 18,
          display: 'flex',
        }}
      />
      <div
        style={{
          color: CREAM,
          fontSize: 30,
          fontWeight: 700,
          letterSpacing: '0.18em',
          display: 'flex',
        }}
      >
        1337
      </div>
    </div>
  );
}

export default function Image() {
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
              marginBottom: 20,
              display: 'flex',
            }}
          >
            Enter a seed · Download in seconds
          </div>

          {/* Hero */}
          <div
            style={{
              color: GOLD,
              fontSize: 80,
              fontWeight: 900,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              lineHeight: 1,
              marginBottom: 22,
              whiteSpace: 'nowrap',
              display: 'flex',
            }}
          >
            Generate Your Mod
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

          {/* Tagline */}
          <div
            style={{
              color: GOLD_DIM,
              fontSize: 22,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              marginBottom: 34,
              display: 'flex',
              textAlign: 'center',
            }}
          >
            Shuffle all 8 class skill trees · Share any seed
          </div>

          <SeedBadge />

          {/* Meta row */}
          <div
            style={{
              color: CREAM,
              fontSize: 14,
              letterSpacing: '0.3em',
              textTransform: 'uppercase',
              marginTop: 30,
              display: 'flex',
            }}
          >
            Free · Offline only · Safe for Battle.net
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
