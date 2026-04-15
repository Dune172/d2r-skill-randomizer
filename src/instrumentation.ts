// Next.js boot-time instrumentation hook. Runs once when the server process
// starts, before any requests are served. This is where we kick off the
// warmup that primes data caches and sprite buffers — without it, the first
// real user pays for cold disk reads and JSON parsing.
//
// Docs: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { warmStatic } = await import('./lib/warmup');
    warmStatic();
  }
}
