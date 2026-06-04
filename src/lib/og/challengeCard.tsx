/* eslint-disable @next/next/no-img-element, jsx-a11y/alt-text */
/**
 * Shared renderer for the weekly-challenge OG card. Used by:
 *   - src/app/challenge/opengraph-image.tsx (Next.js OG image route)
 *   - src/lib/discord-weekly-announcer.ts   (Monday Discord post)
 *
 * Node runtime only — pulls fonts and webp icons off disk.
 */
import { ImageResponse } from 'next/og';
import {
  getWeekStart,
  getWeekEnd,
  getWeekSeed,
  formatWeekDate,
} from '@/lib/challenge/week';
import { getActiveMutations, getWeekName, type MutationDef } from '@/lib/mutations/registry';
import { OG_FONTS } from './fonts';
import { OG_PALETTE } from './palette';
import { OgFrame, OG_SIZE, OG_CONTENT_TYPE } from './frame';
import { mutationIconDataUrl } from './mutationIcon';

export { OG_SIZE, OG_CONTENT_TYPE };

const { GOLD, GOLD_DIM, GOLD_DARK, GOLD_SOFT, CREAM, BORDER, BG_PANEL } = OG_PALETTE;

function MutationCard({ mutation, iconUrl }: { mutation: MutationDef; iconUrl: string | null }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        width: 220,
        padding: '18px 14px 16px',
        border: `1px solid ${BORDER}`,
        borderTop: `2px solid ${GOLD_DARK}`,
        background: BG_PANEL,
      }}
    >
      <div
        style={{
          width: 120,
          height: 120,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 12,
        }}
      >
        {iconUrl ? (
          <img src={iconUrl} width={120} height={120} style={{ objectFit: 'contain' }} />
        ) : (
          <div style={{ fontSize: 64, display: 'flex' }}>{mutation.emoji}</div>
        )}
      </div>
      <div
        style={{
          color: GOLD,
          fontSize: 20,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          textAlign: 'center',
          display: 'flex',
        }}
      >
        {mutation.name}
      </div>
    </div>
  );
}

/** Build the ImageResponse for the given week. */
export async function buildChallengeCardImageResponse(weekNumber: number): Promise<ImageResponse> {
  const seed = getWeekSeed(weekNumber);
  const start = getWeekStart(weekNumber);
  const end = getWeekEnd(weekNumber);
  const dateRange = `${formatWeekDate(start)} – ${formatWeekDate(end)}`;
  const weekName = getWeekName(weekNumber);
  const mutations = getActiveMutations(weekNumber);
  const icons = await Promise.all(mutations.map((m) => mutationIconDataUrl(m.id)));

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
          <div
            style={{
              color: GOLD_SOFT,
              fontSize: 18,
              letterSpacing: '0.4em',
              textTransform: 'uppercase',
              fontWeight: 700,
              marginBottom: 14,
              display: 'flex',
            }}
          >
            Week {weekNumber} · {dateRange}
          </div>

          <div
            style={{
              color: GOLD,
              fontSize: 72,
              fontWeight: 900,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              textShadow: `0 0 32px ${GOLD}66`,
              marginBottom: 10,
              display: 'flex',
            }}
          >
            {weekName}
          </div>

          <div
            style={{
              color: GOLD_DIM,
              fontSize: 16,
              letterSpacing: '0.3em',
              textTransform: 'uppercase',
              marginBottom: 28,
              display: 'flex',
            }}
          >
            This Week&apos;s Challenge Seed
          </div>

          <div
            style={{
              width: 420,
              height: 1,
              background: GOLD_DARK,
              opacity: 0.5,
              marginBottom: 26,
              display: 'flex',
            }}
          />

          <div style={{ display: 'flex', gap: 28, marginBottom: 24 }}>
            {mutations.map((m, i) => (
              <MutationCard key={m.id} mutation={m} iconUrl={icons[i]} />
            ))}
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              marginTop: 4,
            }}
          >
            <div
              style={{
                color: GOLD_SOFT,
                fontSize: 14,
                letterSpacing: '0.35em',
                textTransform: 'uppercase',
                display: 'flex',
              }}
            >
              Seed
            </div>
            <div
              style={{
                color: CREAM,
                fontSize: 22,
                fontWeight: 700,
                letterSpacing: '0.15em',
                display: 'flex',
              }}
            >
              {seed.toLocaleString()}
            </div>
          </div>
        </div>
      </OgFrame>
    ),
    {
      ...OG_SIZE,
      fonts: OG_FONTS,
    },
  );
}

/** Render the weekly challenge card to a PNG buffer (for Discord attachment). */
export async function renderChallengeCardPng(weekNumber: number): Promise<Buffer> {
  const response = await buildChallengeCardImageResponse(weekNumber);
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
