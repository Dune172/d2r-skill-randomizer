/* eslint-disable @next/next/no-img-element, jsx-a11y/alt-text */
import { ImageResponse } from 'next/og';
import { getCurrentWeekNumber } from '@/lib/challenge/week';
import { getActivePair, getWeekName } from '@/lib/mutations/registry';
import { OG_FONTS } from '@/lib/og/fonts';
import { OG_PALETTE } from '@/lib/og/palette';
import { OgFrame, OG_SIZE, OG_CONTENT_TYPE } from '@/lib/og/frame';
import { mutationIconDataUrl } from '@/lib/og/mutationIcon';

export const revalidate = 3600;
export const alt = 'D2R Randomizer — Diablo 2 Resurrected Skill Randomizer Mod';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

const { GOLD, GOLD_DIM, GOLD_DARK, GOLD_SOFT, CREAM, BORDER, BG_PANEL } = OG_PALETTE;

function MiniMutation({ iconUrl, name }: { iconUrl: string | null; name: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '10px 18px 10px 12px',
        border: `1px solid ${BORDER}`,
        borderTop: `2px solid ${GOLD_DARK}`,
        background: BG_PANEL,
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 12,
        }}
      >
        {iconUrl ? <img src={iconUrl} width={44} height={44} style={{ objectFit: 'contain' }} /> : null}
      </div>
      <div
        style={{
          color: GOLD,
          fontSize: 16,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          display: 'flex',
        }}
      >
        {name}
      </div>
    </div>
  );
}

export default async function Image() {
  const weekNumber = getCurrentWeekNumber();
  const weekName = getWeekName(weekNumber);
  const [mutA, mutB] = getActivePair(weekNumber);
  const [iconA, iconB] = await Promise.all([
    mutationIconDataUrl(mutA.id),
    mutationIconDataUrl(mutB.id),
  ]);

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
              fontSize: 17,
              letterSpacing: '0.45em',
              textTransform: 'uppercase',
              fontWeight: 700,
              marginBottom: 22,
              display: 'flex',
            }}
          >
            Diablo 2 Resurrected · Skill Randomizer Mod
          </div>

          {/* Hero title */}
          <div
            style={{
              color: GOLD,
              fontSize: 90,
              fontWeight: 900,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              lineHeight: 1,
              marginBottom: 22,
              whiteSpace: 'nowrap',
              display: 'flex',
            }}
          >
            D2R Randomizer
          </div>

          {/* Tagline */}
          <div
            style={{
              color: GOLD_DIM,
              fontSize: 22,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              marginBottom: 28,
              display: 'flex',
            }}
          >
            Shuffle all 8 class skill trees · Free · Offline
          </div>

          {/* Divider */}
          <div
            style={{
              width: 420,
              height: 1,
              background: GOLD_DARK,
              opacity: 0.5,
              marginBottom: 22,
              display: 'flex',
            }}
          />

          {/* Week teaser */}
          <div
            style={{
              color: GOLD_SOFT,
              fontSize: 13,
              letterSpacing: '0.4em',
              textTransform: 'uppercase',
              marginBottom: 14,
              display: 'flex',
            }}
          >
            This Week · {weekName}
          </div>

          <div style={{ display: 'flex' }}>
            <div style={{ marginRight: 16, display: 'flex' }}>
              <MiniMutation iconUrl={iconA} name={mutA.name} />
            </div>
            <MiniMutation iconUrl={iconB} name={mutB.name} />
          </div>

          {/* Trust row */}
          <div
            style={{
              color: CREAM,
              fontSize: 13,
              letterSpacing: '0.3em',
              textTransform: 'uppercase',
              marginTop: 24,
              display: 'flex',
            }}
          >
            Safe for Battle.net · Offline only · Free
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
