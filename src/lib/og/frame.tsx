/**
 * Shared ornate frame for all OG images.
 *
 * Renders a 1200×630 canvas with the site's background, a double-ruled gold
 * border inset from the edges, small diamond ornaments at the corners, and a
 * `D2R RANDOMIZER · d2rrandomizer.com` lockup along the bottom. Page-specific
 * content is passed as `children` and laid out inside the inner content area.
 *
 * Note: Satori (which powers `next/og`) is strict — any undefined CSS value
 * causes rendering to fail with "Cannot read properties of undefined". Always
 * spread conditional position props into the style object instead of setting
 * them to undefined.
 */
import type { ReactElement } from 'react';
import { OG_PALETTE } from './palette';

const { BG, GOLD, GOLD_DIM, GOLD_DARK, ACCENT_RED_DEEP } = OG_PALETTE;

const INSET = 28;
const INSET_INNER = 38;
const FOOTER_BAND_HEIGHT = 46;

function CornerDiamond(props: { top?: number; left?: number; right?: number; bottom?: number }) {
  const pos: Record<string, number> = {};
  if (props.top !== undefined) pos.top = props.top;
  if (props.left !== undefined) pos.left = props.left;
  if (props.right !== undefined) pos.right = props.right;
  if (props.bottom !== undefined) pos.bottom = props.bottom;
  return (
    <div
      style={{
        position: 'absolute',
        ...pos,
        width: 10,
        height: 10,
        background: GOLD,
        transform: 'rotate(45deg)',
        display: 'flex',
      }}
    />
  );
}

export function OgFrame({ children }: { children: ReactElement }): ReactElement {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: BG,
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        fontFamily: 'Cinzel',
        color: GOLD,
      }}
    >
      {/* Subtle burgundy top/bottom vignettes (satori doesn't support gradients) */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 200,
          background: ACCENT_RED_DEEP,
          opacity: 0.25,
          display: 'flex',
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 160,
          background: ACCENT_RED_DEEP,
          opacity: 0.25,
          display: 'flex',
        }}
      />

      {/* Outer border */}
      <div
        style={{
          position: 'absolute',
          top: INSET,
          left: INSET,
          right: INSET,
          bottom: INSET,
          border: `1px solid ${GOLD_DARK}`,
          display: 'flex',
        }}
      />
      {/* Inner hairline */}
      <div
        style={{
          position: 'absolute',
          top: INSET_INNER,
          left: INSET_INNER,
          right: INSET_INNER,
          bottom: INSET_INNER,
          border: `1px solid ${GOLD_DARK}`,
          opacity: 0.45,
          display: 'flex',
        }}
      />

      {/* Corner diamonds on the outer frame */}
      <CornerDiamond top={INSET - 5} left={INSET - 5} />
      <CornerDiamond top={INSET - 5} right={INSET - 5} />
      <CornerDiamond bottom={INSET - 5} left={INSET - 5} />
      <CornerDiamond bottom={INSET - 5} right={INSET - 5} />

      {/* Main content area — reserves bottom space for the footer lockup */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          padding: `60px 90px ${FOOTER_BAND_HEIGHT + 40}px 90px`,
          position: 'relative',
        }}
      >
        {children}
      </div>

      {/* Footer lockup — positioned inside the double-border frame */}
      <div
        style={{
          position: 'absolute',
          bottom: INSET + 14,
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <div style={{ width: 40, height: 1, background: GOLD_DARK, display: 'flex' }} />
        <div
          style={{
            color: GOLD_DIM,
            fontSize: 13,
            letterSpacing: '0.4em',
            textTransform: 'uppercase',
            fontWeight: 700,
            margin: '0 20px',
            display: 'flex',
          }}
        >
          D2R Randomizer
        </div>
        <div
          style={{
            width: 7,
            height: 7,
            background: GOLD_DARK,
            transform: 'rotate(45deg)',
            display: 'flex',
          }}
        />
        <div
          style={{
            color: GOLD_DARK,
            fontSize: 12,
            letterSpacing: '0.3em',
            textTransform: 'uppercase',
            margin: '0 20px',
            display: 'flex',
          }}
        >
          d2rrandomizer.com
        </div>
        <div style={{ width: 40, height: 1, background: GOLD_DARK, display: 'flex' }} />
      </div>
    </div>
  );
}

/** Standard dimensions used for every OG image. */
export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_CONTENT_TYPE = 'image/png' as const;
