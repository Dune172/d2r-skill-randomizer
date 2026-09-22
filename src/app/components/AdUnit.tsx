'use client';

import { useEffect, useRef, useState } from 'react';
import { adsense, type AdPlacement } from '@/lib/adsense';
import { useAdSenseStatus } from './AdSenseProvider';

declare global {
  interface Window {
    adsbygoogle?: { push: (request: Record<string, never>) => unknown };
  }
}

export default function AdUnit({ placement }: { placement: AdPlacement }) {
  const status = useAdSenseStatus();
  const element = useRef<HTMLModElement>(null);
  const requested = useRef(false);
  const [failed, setFailed] = useState(false);
  const slot = adsense.slots[placement];
  const visible = adsense.enabled && !!slot && status !== 'failed' && !failed;

  useEffect(() => {
    const ad = element.current;
    if (!visible || status !== 'ready' || !ad || requested.current) return;

    // Wait for a measurable container. Strict Mode and resize callbacks must
    // never request a second ad for the same element.
    const request = () => {
      if (!ad.isConnected || ad.getBoundingClientRect().width <= 0 || requested.current) return;
      requested.current = true;
      if (ad.hasAttribute('data-adsbygoogle-status')) return;
      try {
        window.adsbygoogle ||= [] as Record<string, never>[];
        window.adsbygoogle.push({});
      } catch {
        // An ad blocker or network failure must not affect mod generation.
        setFailed(true);
      }
    };
    request();
    if (requested.current) return;
    const observer = new ResizeObserver(request);
    observer.observe(ad);
    return () => observer.disconnect();
  }, [visible, status]);

  if (!visible && !adsense.preview) return null;

  return (
    <aside aria-label="Advertisement" className="mx-auto my-12 w-full max-w-5xl px-4">
      <p className="mb-2 text-center text-xs text-[#a89060]">Advertisement</p>
      <div className="min-h-72 w-full md:min-h-28">
        {adsense.preview ? (
          <div className="flex min-h-72 items-center justify-center border border-dashed border-[#a89060] text-sm text-[#a89060] md:min-h-28">
            Ad placement preview: {placement}
          </div>
        ) : <ins
          ref={element}
          className="adsbygoogle"
          style={{ display: 'block' }}
          data-ad-client={adsense.clientId}
          data-ad-slot={slot}
          data-ad-format="horizontal"
          data-full-width-responsive="false"
        />}
      </div>
    </aside>
  );
}
