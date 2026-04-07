import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'D2R Randomizer — Generate Your Mod';
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
          gap: 0,
          padding: '60px',
        }}
      >
        <div style={{ color: '#7a5818', fontSize: 18, letterSpacing: '0.35em', textTransform: 'uppercase', marginBottom: 20 }}>
          Free Mod · Offline Only · Diablo 2 Resurrected
        </div>

        <div style={{ color: '#c8942a', fontSize: 64, fontWeight: 900, letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 16, textShadow: '0 0 40px rgba(200,148,42,0.5)' }}>
          D2R Randomizer
        </div>

        <div style={{ width: '480px', height: '1px', background: '#c8942a', opacity: 0.35, marginBottom: 28 }} />

        <div style={{ color: '#e8c87a', fontSize: 32, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 24 }}>
          Generate Your Mod
        </div>

        <div style={{ color: '#a89060', fontSize: 20, letterSpacing: '0.08em', textAlign: 'center', maxWidth: '700px', lineHeight: 1.5 }}>
          Shuffle all 7 class skill trees with any seed. Download and install in seconds.
        </div>
      </div>
    ),
    { ...size }
  );
}
