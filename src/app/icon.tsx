import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          background: '#080204',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 4,
        }}
      >
        <div style={{ color: '#c8942a', fontSize: 18, fontWeight: 900, letterSpacing: '0.05em' }}>
          D2
        </div>
      </div>
    ),
    { ...size }
  );
}
