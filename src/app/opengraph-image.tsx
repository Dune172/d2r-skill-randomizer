import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'D2R Randomizer';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function Image() {
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
          gap: 16,
        }}
      >
        <div style={{ color: '#c8942a', fontSize: 72, fontWeight: 900, letterSpacing: '0.15em', textTransform: 'uppercase' }}>
          D2R Randomizer
        </div>
        <div style={{ color: '#a87830', fontSize: 28, letterSpacing: '0.3em', textTransform: 'uppercase' }}>
          Randomize your D2R experience
        </div>
      </div>
    ),
    { ...size }
  );
}
