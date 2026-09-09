'use client';

import { useEffect } from 'react';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const isChunkError =
    error?.name === 'ChunkLoadError' || error?.message?.includes('Failed to load chunk');

  useEffect(() => {
    if (!isChunkError) return;
    // Shares the '_cr' attempt counter with the inline handler in layout.tsx.
    // This used to key off the error message, so a run of distinct chunk errors
    // could reload the page over and over — and when the origin is shedding
    // load rather than mid-deploy, those reloads are what keep it shedding.
    // Same bounded, jittered backoff as layout.tsx.
    const attempts = parseInt(sessionStorage.getItem('_cr') || '0', 10) || 0;
    if (attempts >= 2) return;
    sessionStorage.setItem('_cr', String(attempts + 1));
    const delay = 1000 * Math.pow(2, attempts) + Math.random() * 2000;
    const timer = setTimeout(() => window.location.reload(), delay);
    return () => clearTimeout(timer);
  }, [isChunkError]);

  if (isChunkError) return null;

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center space-y-4">
        <p className="font-cinzel text-[#c8a870]">Something went wrong.</p>
        <button
          onClick={reset}
          className="font-cinzel text-sm tracking-widest uppercase text-[#7a5818] hover:text-[#c8a870] transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
