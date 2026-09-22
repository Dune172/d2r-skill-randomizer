// NEXT_PUBLIC values are intentionally read directly: Next.js freezes these at
// build time so the server, browser, verification tag, and ads.txt agree.
export function getAdsenseConfig(env: Record<string, string | undefined>) {
  const rawClient = env.NEXT_PUBLIC_ADSENSE_CLIENT_ID?.trim() ?? '';
  const clientId = /^ca-pub-\d{16}$/.test(rawClient) ? rawClient : '';
  const slot = (value: string | undefined) => /^\d+$/.test(value?.trim() ?? '') ? value!.trim() : '';
  const slots = {
    home: slot(env.NEXT_PUBLIC_ADSENSE_SLOT_HOME),
    generate: slot(env.NEXT_PUBLIC_ADSENSE_SLOT_GENERATE),
    challenge: slot(env.NEXT_PUBLIC_ADSENSE_SLOT_CHALLENGE),
  };
  const preview = env.NODE_ENV === 'development' && env.NEXT_PUBLIC_ADSENSE_PREVIEW === 'true';
  return {
    clientId,
    slots,
    preview,
    enabled: env.NEXT_PUBLIC_ADSENSE_ENABLED === 'true' && !!clientId &&
      Object.values(slots).some(Boolean) && env.NODE_ENV === 'production',
  };
}

export const adsense = getAdsenseConfig({
  NODE_ENV: process.env.NODE_ENV,
  // Public publisher ID supplied for d2rrandomizer.com. An explicit empty env
  // value disables verification; an unset value uses the site's account.
  NEXT_PUBLIC_ADSENSE_CLIENT_ID: process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID ?? 'ca-pub-3935204626299309',
  NEXT_PUBLIC_ADSENSE_ENABLED: process.env.NEXT_PUBLIC_ADSENSE_ENABLED,
  NEXT_PUBLIC_ADSENSE_PREVIEW: process.env.NEXT_PUBLIC_ADSENSE_PREVIEW,
  NEXT_PUBLIC_ADSENSE_SLOT_HOME: process.env.NEXT_PUBLIC_ADSENSE_SLOT_HOME ?? '1283727238',
  NEXT_PUBLIC_ADSENSE_SLOT_GENERATE: process.env.NEXT_PUBLIC_ADSENSE_SLOT_GENERATE ?? '1395407878',
  NEXT_PUBLIC_ADSENSE_SLOT_CHALLENGE: process.env.NEXT_PUBLIC_ADSENSE_SLOT_CHALLENGE ?? '3545174476',
});

export type AdPlacement = keyof typeof adsense.slots;
