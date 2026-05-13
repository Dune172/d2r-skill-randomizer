import { ImageResponse } from 'next/og';
import { OG_FONTS } from '@/lib/og/fonts';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

const BG = '#060203';
const BORDER = '#7a1f0a';
const GOLD = '#c8942a';
const STROKE = '#2a0e04';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: BG,
          border: `6px solid ${BORDER}`,
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            color: GOLD,
            fontFamily: 'Cinzel',
            fontWeight: 900,
            fontSize: 140,
            lineHeight: 1,
            letterSpacing: '0.02em',
            display: 'flex',
            textShadow: `0 0 1px ${STROKE}`,
            transform: 'translateY(4px)',
          }}
        >
          D
        </div>
      </div>
    ),
    {
      ...size,
      fonts: OG_FONTS,
    }
  );
}
