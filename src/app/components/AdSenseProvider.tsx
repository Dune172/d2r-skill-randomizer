'use client';

import Script from 'next/script';
import { createContext, useContext, useState, type ReactNode } from 'react';
import { adsense } from '@/lib/adsense';

type AdScriptStatus = 'loading' | 'ready' | 'failed';
const AdSenseContext = createContext<AdScriptStatus>('loading');

export function useAdSenseStatus() {
  return useContext(AdSenseContext);
}

export default function AdSenseProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AdScriptStatus>('loading');

  return (
    <AdSenseContext.Provider value={status}>
      {adsense.enabled && (
        <Script
          id="google-adsense"
          async
          src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adsense.clientId}`}
          crossOrigin="anonymous"
          strategy="afterInteractive"
          onReady={() => setStatus('ready')}
          onError={() => setStatus('failed')}
        />
      )}
      {children}
    </AdSenseContext.Provider>
  );
}
