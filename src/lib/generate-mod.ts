/** Shared by both generators. Keep the same seed/options across bounded retries. */
export async function generateMod(body: string, onWaiting: (message: string) => void): Promise<void> {
  const maxAttempts = 3;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    onWaiting('');
    const response = await fetch('/api/randomize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    if (response.ok) return;

    // Hosting/CDN errors can be HTML; preserve the HTTP error instead of
    // replacing it with an unhelpful JSON parsing exception.
    const data = await response.json().catch(() => null);
    const retryable = response.status === 429 || response.status === 503;
    const header = response.headers.get('Retry-After');
    const seconds = header && /^\d+$/.test(header.trim())
      ? Number(header)
      : header ? (Date.parse(header) - Date.now()) / 1000 : data?.retryAfter;
    const delay = Number.isFinite(seconds)
      ? Math.max(1, Math.ceil(seconds))
      : response.status === 429 ? 60 : 5 * (attempt + 1);

    // Do not shorten the server's requested wait. Long cooldowns are surfaced
    // to the user instead of holding a generation open indefinitely.
    if (retryable && attempt < maxAttempts - 1 && delay <= 60) {
      onWaiting(response.status === 429
        ? `Generation limit reached. Retrying this seed in ${delay}s…`
        : `Server is busy. Retrying this seed in ${delay}s…`);
      await new Promise(resolve => setTimeout(resolve, delay * 1000));
      continue;
    }

    throw new Error(typeof data?.error === 'string' ? data.error
      : retryable ? `Server ${response.status === 429 ? 'request limit reached' : 'is busy'} (HTTP ${response.status}). Please try again in ${delay}s.`
      : `Generation failed (HTTP ${response.status}). Please try again.`);
  }
}
