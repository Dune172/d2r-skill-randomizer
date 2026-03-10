'use client';

import { useEffect } from 'react';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const isChunkError =
    error?.name === 'ChunkLoadError' || error?.message?.includes('Failed to load chunk');

  useEffect(() => {
    if (isChunkError) {
      const key = `chunk_reload:${error.message}`;
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, '1');
        window.location.reload();
      }
    }
  }, [isChunkError, error.message]);

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
